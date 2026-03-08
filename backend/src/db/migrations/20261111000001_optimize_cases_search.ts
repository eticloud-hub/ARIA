import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
    // 1. Add the tsvector column
    pgm.addColumn('cases', {
        search_vector: { type: 'tsvector' }
    });

    // 2. Populate it for existing rows
    pgm.sql(`
        UPDATE cases 
        SET search_vector = 
            setweight(to_tsvector('english', coalesce(title, '')), 'A') || 
            setweight(to_tsvector('english', coalesce(reference_id, '')), 'A') || 
            setweight(to_tsvector('english', coalesce(description, '')), 'B');
    `);

    // 3. Create GIN index for high-performance text search
    pgm.createIndex('cases', 'search_vector', { method: 'gin', name: 'idx_cases_search_vector' });

    // 4. Create trigger to keep it updated automatically
    pgm.sql(`
        CREATE FUNCTION cases_search_vector_trigger() RETURNS trigger AS $$
        begin
            new.search_vector := 
                setweight(to_tsvector('english', coalesce(new.title, '')), 'A') || 
                setweight(to_tsvector('english', coalesce(new.reference_id, '')), 'A') || 
                setweight(to_tsvector('english', coalesce(new.description, '')), 'B');
            return new;
        end
        $$ LANGUAGE plpgsql;
    `);

    pgm.sql(`
        CREATE TRIGGER tsvectorupdate 
        BEFORE INSERT OR UPDATE ON cases 
        FOR EACH ROW EXECUTE FUNCTION cases_search_vector_trigger();
    `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
    pgm.sql(`DROP TRIGGER IF EXISTS tsvectorupdate ON cases`);
    pgm.sql(`DROP FUNCTION IF EXISTS cases_search_vector_trigger`);
    pgm.dropIndex('cases', 'search_vector', { name: 'idx_cases_search_vector' });
    pgm.dropColumns('cases', ['search_vector']);
}
