#!/usr/bin/env node

/**
 * Script to fix missing overrides for approved override requests
 * 
 * This script will:
 * 1. Find all approved override requests that don't have corresponding overrides
 * 2. Create the missing overrides in the student_day_overrides table
 * 3. Report on what was fixed
 */

const { sql } = require('@vercel/postgres')

async function findMissingOverrides() {
  console.log('🔍 Finding approved override requests without corresponding overrides...')
  
  try {
    // Find approved override requests that don't have overrides
    const result = await sql`
      SELECT 
        sr.id as request_id,
        sr.student_id,
        sr.student_name,
        sr.day_number,
        sr.override_date,
        sr.request_details,
        sr.admin_notes,
        sr.processed_at
      FROM student_requests sr
      LEFT JOIN student_day_overrides sdo 
        ON sr.student_id = sdo.student_id 
        AND sr.day_number = sdo.day_number
      WHERE sr.request_type = 'override_request'
        AND sr.status = 'approved'
        AND sr.day_number IS NOT NULL
        AND sr.override_date IS NOT NULL
        AND sdo.id IS NULL
      ORDER BY sr.processed_at DESC
    `
    
    console.log(`Found ${result.rows.length} approved override requests without overrides:`)
    
    if (result.rows.length === 0) {
      console.log('✅ No missing overrides found!')
      return []
    }
    
    // Display the missing overrides
    result.rows.forEach((row, index) => {
      console.log(`\n${index + 1}. Request ID: ${row.request_id}`)
      console.log(`   Student: ${row.student_name} (${row.student_id})`)
      console.log(`   Day: ${row.day_number}`)
      console.log(`   Date: ${row.override_date}`)
      console.log(`   Details: ${row.request_details}`)
      console.log(`   Admin Notes: ${row.admin_notes || 'None'}`)
      console.log(`   Processed: ${row.processed_at}`)
    })
    
    return result.rows
  } catch (error) {
    console.error('❌ Error finding missing overrides:', error)
    throw error
  }
}

async function createMissingOverrides(missingOverrides) {
  console.log(`\n🔧 Creating ${missingOverrides.length} missing overrides...`)
  
  const results = []
  
  for (const request of missingOverrides) {
    try {
      console.log(`\nCreating override for ${request.student_name} - Day ${request.day_number}...`)
      
      const overrideResult = await sql`
        INSERT INTO student_day_overrides (
          student_id, 
          day_number, 
          date, 
          override_type, 
          reason
        )
        VALUES (
          ${request.student_id}, 
          ${request.day_number}, 
          ${request.override_date}, 
          'qualified',
          ${`Override approved: ${request.admin_notes || request.request_details}`}
        )
        ON CONFLICT (student_id, day_number)
        DO UPDATE SET
          override_type = 'qualified',
          reason = EXCLUDED.reason,
          updated_at = NOW()
        RETURNING id, created_at, updated_at
      `
      
      const override = overrideResult.rows[0]
      results.push({
        requestId: request.request_id,
        studentName: request.student_name,
        studentId: request.student_id,
        dayNumber: request.day_number,
        overrideId: override.id,
        createdAt: override.created_at,
        updatedAt: override.updated_at
      })
      
      console.log(`✅ Created override ID: ${override.id}`)
      
    } catch (error) {
      console.error(`❌ Error creating override for ${request.student_name}:`, error)
      results.push({
        requestId: request.request_id,
        studentName: request.student_name,
        studentId: request.student_id,
        dayNumber: request.day_number,
        error: error.message
      })
    }
  }
  
  return results
}

async function main() {
  console.log('🚀 Starting override fix script...\n')
  
  try {
    // Check database connection
    console.log('📡 Testing database connection...')
    await sql`SELECT 1`
    console.log('✅ Database connection successful\n')
    
    // Find missing overrides
    const missingOverrides = await findMissingOverrides()
    
    if (missingOverrides.length === 0) {
      console.log('\n🎉 All approved override requests already have corresponding overrides!')
      return
    }
    
    // Ask for confirmation
    console.log(`\n⚠️  Found ${missingOverrides.length} missing overrides.`)
    console.log('This will create overrides in the student_day_overrides table.')
    
    // For automated execution, we'll proceed without user input
    // In a real scenario, you might want to add a confirmation prompt here
    
    // Create the missing overrides
    const results = await createMissingOverrides(missingOverrides)
    
    // Report results
    console.log('\n📊 SUMMARY:')
    console.log('=' * 50)
    
    const successful = results.filter(r => !r.error)
    const failed = results.filter(r => r.error)
    
    console.log(`✅ Successfully created: ${successful.length} overrides`)
    console.log(`❌ Failed to create: ${failed.length} overrides`)
    
    if (successful.length > 0) {
      console.log('\n✅ Successfully created overrides:')
      successful.forEach(result => {
        console.log(`   - ${result.studentName} (${result.studentId}) - Day ${result.dayNumber} - Override ID: ${result.overrideId}`)
      })
    }
    
    if (failed.length > 0) {
      console.log('\n❌ Failed to create overrides:')
      failed.forEach(result => {
        console.log(`   - ${result.studentName} (${result.studentId}) - Day ${result.dayNumber} - Error: ${result.error}`)
      })
    }
    
    console.log('\n🎉 Override fix script completed!')
    
  } catch (error) {
    console.error('\n💥 Script failed:', error)
    process.exit(1)
  }
}

// Run the script
if (require.main === module) {
  main()
}

module.exports = { findMissingOverrides, createMissingOverrides }
