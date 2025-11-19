import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddChunkStatusToDocuments1732000000000 implements MigrationInterface {
  name = 'AddChunkStatusToDocuments1732000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'kb.documents',
      new TableColumn({
        name: 'chunk_status',
        type: 'varchar',
        length: '20',
        default: "'pending'",
        isNullable: false,
      })
    );

    // Update existing documents to 'completed' since they already have chunks
    await queryRunner.query(
      `UPDATE kb.documents SET chunk_status = 'completed' WHERE chunk_status = 'pending'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('kb.documents', 'chunk_status');
  }
}
