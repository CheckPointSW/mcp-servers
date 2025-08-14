import { createHash } from 'crypto';
import { readFileSync} from 'fs';


// Utility for string checks
export function nullOrEmpty(val?: string): boolean {
  return (
    val === undefined ||
    val === null ||
    (typeof val === 'string' && (val.trim() === '' || val === 'undefined' || val === 'null'))
  );
}

// Helper function to calculate MD5 hash
export function calculateMD5(filePath: string): string {
    const fileBuffer = readFileSync(filePath);
    return createHash('md5').update(fileBuffer).digest('hex');
}

