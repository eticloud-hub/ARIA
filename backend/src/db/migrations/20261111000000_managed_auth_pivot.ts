import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
    // Drop columns related to internal authentication
    pgm.dropColumns('users', [
        'password_hash',
        'token_version',
        'mfa_secret',
        'mfa_enabled',
    ]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
    // Re-add columns if rolling back
    pgm.addColumns('users', {
        password_hash: { type: 'text', notNull: false },
        token_version: { type: 'integer', notNull: true },
        mfa_secret: { type: 'text' },
        mfa_enabled: { type: 'boolean', notNull: true },
    });
}
