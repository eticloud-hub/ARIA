/**
 * Patch @types/supertest to fix missing `.set()` / `.send()` chaining
 * on the `Test` type. This is a known issue with @types/supertest@7.x
 * where `.get()`, `.post()`, etc. return `Test` but `.set()` is typed
 * on `superagent.Request` and the interface merge is incomplete.
 *
 * @see https://github.com/DefinitelyTyped/DefinitelyTyped/issues/68193
 */
import 'supertest';

declare module 'supertest' {
    interface Test {
        // Request chaining methods
        set(field: string, val: string): this;
        set(field: Record<string, string>): this;
        send(data?: string | object): this;
        expect(status: number): this;
        expect(status: number, body: any): this;

        // Response properties (available after await)
        body: any;
        status: number;
        headers: Record<string, string>;
        text: string;
        type: string;
    }
}
