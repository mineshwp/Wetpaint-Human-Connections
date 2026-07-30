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
  const doc = {
    employee_id: 'bfe33140-d31a-4756-95d2-431747f0b069',
    category: 'contract',
    name: 'Employment Contract QA.pdf',
    file_url: 'https://example.com/mock-contract.pdf',
    file_size: 102400,
    mime_type: 'application/pdf',
    uploaded_by: 'bfe33140-d31a-4756-95d2-431747f0b069',
    hidden_from_employee: false
  };

  const { data, error } = await supabase
    .from('documents')
    .insert([doc])
    .select();

  if (error) {
    console.error('Error inserting document:', error);
  } else {
    console.log('Successfully inserted document:', data);
  }
}

main();
