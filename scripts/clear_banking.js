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
    .update({
      bank_name: null,
      bank_account_number: null,
      bank_branch_code: null,
      bank_account_type: null,
      bank_verification_status: null
    })
    .eq('id', 'bfe33140-d31a-4756-95d2-431747f0b069')
    .select();

  if (error) {
    console.error('Error clearing banking:', error);
  } else {
    console.log('Successfully cleared banking info:', data);
  }
}

main();
