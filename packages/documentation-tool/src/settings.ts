import { Settings } from '@chkp/quantum-infra';

export class DocumentationToolSettings extends Settings {
    constructor(args: Record<string, unknown> = {}) {
        super(args);
    }

    /**
     * Create DocumentationToolSettings from command-line arguments for Documentation Tool
     */
    static fromArgs(args: Record<string, unknown>): DocumentationToolSettings {
        return new DocumentationToolSettings({
            ...args,
        });
    }
}
