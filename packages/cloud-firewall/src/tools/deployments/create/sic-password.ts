import { z } from 'zod';
import { Settings } from '../../../settings.js';

/**
 * "$env:NAME" pass-by-reference for the SIC password, resolved server-side so
 * the plaintext never transits the model context or chat transcript. The
 * allowlist (CFW_SIC_* only) is load-bearing: an unrestricted reference would
 * let a caller exfiltrate arbitrary server environment values (tokens, keys)
 * through the deployment payload in a shared/HTTP process.
 *
 * Standalone module (rather than inline in a management profile) because more
 * than one cloud's management profile carries a write-only SIC secret and
 * every one of them should resolve `$env:` references the same way.
 */
export const SIC_REF_NAME_SOURCE = 'CFW_SIC_[A-Z0-9_]{0,64}';
export const SIC_ENV_REF = new RegExp(`^\\$env:(${SIC_REF_NAME_SOURCE})$`);

/**
 * The zod piece for a SIC-shaped secret field: a regex admitting both the
 * inline value and the `$env:CFW_SIC_*` reference, plus a `.transform()` that
 * resolves the reference against `process.env` (fail closed on anything
 * outside the allowlist, an unset variable, or a resolved value that isn't
 * itself a valid SIC password).
 *
 * A function rather than a bare exported schema so each caller can attach its
 * own `.describe()` — the wording differs per field name (sicPassword vs a
 * differently named secret on another cloud).
 */
export function sicPasswordSchema({
    minLength = 12,
    maxLength = 64,
}: { minLength?: number; maxLength?: number } = {}) {
    const valueSource = `[a-zA-Z0-9]{${minLength},${maxLength}}`;
    const valuePattern = new RegExp(`^${valueSource}$`);
    const rule = `${minLength}-${maxLength} alphanumeric`;
    return (
        z
            .string()
            // The union pattern IS the advertised JSON schema (effectStrategy
            // 'input'), so it must admit both forms — a pipe()d output schema
            // would surface as an allOf whose alphanumeric pattern makes
            // schema-enforcing clients reject the $env: sentinel client-side.
            .regex(
                new RegExp(`^(${valueSource}|\\$env:${SIC_REF_NAME_SOURCE})$`),
                `${rule}, or a "$env:CFW_SIC_*" server-environment reference`
            )
            .transform((value, ctx) => {
                if (!value.startsWith('$env:')) return value;
                if (!Settings.canResolveEnvironmentSecrets()) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message:
                            'Server-environment SIC references are disabled for shared HTTP transport; supply the caller SIC value inline.',
                    });
                    return z.NEVER;
                }
                const ref = SIC_ENV_REF.exec(value);
                // Fail closed: a $env-shaped value outside the allowlist must
                // never be forwarded to the backend as a literal password, even
                // if the advertised union pattern and SIC_ENV_REF ever drift.
                if (!ref) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message:
                            'only "$env:CFW_SIC_*" server-environment references are resolvable',
                    });
                    return z.NEVER;
                }
                const resolved = process.env[ref[1]];
                if (resolved === undefined) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `environment variable ${ref[1]} is not set in the server environment — set it (e.g. via the Keychain launcher) and reconnect the server, or supply the password inline`,
                    });
                    return z.NEVER;
                }
                // Never echo the resolved value in the issue: it may be a secret.
                if (!valuePattern.test(resolved)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `the value of ${ref[1]} is not a valid SIC password (must be ${rule})`,
                    });
                    return z.NEVER;
                }
                return resolved;
            })
    );
}
