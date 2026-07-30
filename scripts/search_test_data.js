const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

const interactiveTables = [
  'documents',
  'hr_notes',
  'kpi_reviews',
  'kpi_review_invitees',
  'kpi_scores',
  'employee_training'
];

async function main() {
  console.log("Searching for test/demo strings in interactive tables...");
  for (const table of interactiveTables) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.error(`Error reading ${table}:`, error.message);
      continue;
    }

    const testRows = data.filter(row => {
      const str = JSON.stringify(row).toLowerCase();
      return str.includes('test') || str.includes('demo') || str.includes('placeholder') || str.includes('dummy') || str.includes('sample');
    });

    if (testRows.length > 0) {
      console.log(`Found ${testRows.length} matches in table '${table}':`);
      testRows.forEach(r => {
        console.log(JSON.stringify(r));
      });
    } else {
      console.log(`Table '${table}' has 0 matching test rows.`);
    }
  }
}

main();
