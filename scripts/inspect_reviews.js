const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function main() {
  const { data: reviews, error } = await supabase
    .from('kpi_reviews')
    .select(`
      id,
      employee_id,
      period,
      title,
      deadline,
      status,
      employees (
        first_name,
        last_name
      )
    `);

  if (error) {
    console.error("Error fetching reviews:", error);
    return;
  }

  console.log("Current KPI Reviews:");
  reviews.forEach(r => {
    const empName = r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : "Unknown";
    console.log(`- Review ID: ${r.id} | Employee: ${empName} | Period: ${r.period} | Title: ${r.title} | Status: ${r.status}`);
  });
}

main();
