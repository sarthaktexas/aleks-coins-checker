#!/usr/bin/env node

/**
 * Database Migration Script
 * Adds section_number column to existing student_data table
 * and sets default values for existing records
 */

const { sql } = require('@vercel/postgres');

async function migrateDatabase() {
  try {
    console.log('Starting database migration...');
    
    // Check if section_number column already exists
    const columnCheck = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'student_data' AND column_name = 'section_number'
    `;
    
    if (columnCheck.rows.length > 0) {
      console.log('✅ section_number column already exists. Migration not needed.');
      return;
    }
    
    console.log('Adding section_number column...');
    
    // Add the section_number column with a default value
    await sql`
      ALTER TABLE student_data 
      ADD COLUMN section_number VARCHAR(20) DEFAULT 'default'
    `;
    
    console.log('✅ Successfully added section_number column');
    
    // Update existing records to have 'default' as section_number
    const updateResult = await sql`
      UPDATE student_data 
      SET section_number = 'default' 
      WHERE section_number IS NULL
    `;
    
    console.log(`✅ Updated ${updateResult.rowCount || 0} existing records with default section number`);
    
    // Make the column NOT NULL now that all records have values
    await sql`
      ALTER TABLE student_data 
      ALTER COLUMN section_number SET NOT NULL
    `;
    
    console.log('✅ Migration completed successfully!');
    console.log('All existing data now has section_number = "default"');
    console.log('New uploads will require a section number to be specified.');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateDatabase();
