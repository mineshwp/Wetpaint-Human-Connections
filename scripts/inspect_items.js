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
    .from('kpi_template_items')
    .select('*')
    .limit(1);

  if (error) {
    console.error(error);
  } else {
    console.log("Keys of kpi_template_items:", Object.keys(data[0] || {}));
    console.log("Sample item:", data[0]);
  }
}

main();
