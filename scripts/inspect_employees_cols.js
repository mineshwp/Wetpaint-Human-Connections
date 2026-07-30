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
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching employee:', error);
  } else if (data && data.length > 0) {
    console.log('Employee columns:', Object.keys(data[0]));
  } else {
    console.log('No employee found.');
  }
}

main();
