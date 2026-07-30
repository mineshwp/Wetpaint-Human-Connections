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
    .from('documents')
    .delete()
    .eq('employee_id', 'bfe33140-d31a-4756-95d2-431747f0b069')
    .select();

  if (error) {
    console.error('Error deleting document:', error);
  } else {
    console.log('Successfully deleted document:', data);
  }
}

main();
