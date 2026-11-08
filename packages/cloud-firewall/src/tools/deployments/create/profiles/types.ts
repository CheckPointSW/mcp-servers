import { z } from 'zod';
import type { Problem, ToolArgs } from '../../../types.js';

/** A reusable slice of the documented backend create request. */
export interface CreateProfile<Shape extends z.ZodRawShape = z.ZodRawShape> {
    schema: Shape;
    precheck?: (args: ToolArgs) => Problem[];
}

export function defineProfile<Shape extends z.ZodRawShape>(
    profile: CreateProfile<Shape>
): CreateProfile<Shape> {
    return profile;
}
