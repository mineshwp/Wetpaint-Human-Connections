const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

const tables = [
  'employees',
  'app_users',
  'departments',
  'documents',
  'hr_notes',
  'kpi_template_sections',
  'kpi_template_items',
  'kpi_reviews',
  'kpi_review_invitees',
  'kpi_scores',
  'kpi_settings',
  'employee_training'
];

async function main() {
  console.log("Checking all project tables for any records...");
  for (const table of tables) {
    try {
      const { data, count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact' });

      if (error) {
        console.error(`Error reading ${table}:`, error.message);
      } else {
        console.log(`Table '${table}' has ${count} records.`);
        // Inspect data for any "test" or "demo" strings
        const demoRecords = data.filter(row => {
          const str = JSON.stringify(row).toLowerCase();
          return str.includes('test') || str.includes('demo') || str.includes('placeholder') || str.includes('dummy') || str.includes('sample');
        });
        if (demoRecords.length > 0) {
          console.log(`  ⚠ Found ${demoRecords.length} potential demo/test records in '${table}':`);
          demoRecords.forEach(r => {
            console.log(`    -`, JSON.stringify(r).substring(0, 150));
          });
        }
      }
    } catch (e) {
      console.error(`Exception on table ${table}:`, e.message);
    }
  }
}

main();
