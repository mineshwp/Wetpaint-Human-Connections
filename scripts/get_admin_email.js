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
  const { data: user, error } = await supabase.auth.admin.getUserById('30a77b62-a476-45ae-aaec-dd9b8d35a260');
  if (error) {
    console.error("Error fetching user:", error);
    return;
  }
  console.log("Auth user details:", {
    id: user.user.id,
    email: user.user.email,
    role: user.user.role
  });

  const { data: appUser, error: appUserErr } = await supabase
    .from('app_users')
    .select('*')
    .eq('id', '30a77b62-a476-45ae-aaec-dd9b8d35a260')
    .single();
  
  if (appUserErr) {
    console.error("Error fetching app_user row:", appUserErr);
  } else {
    console.log("app_users row details:", appUser);
  }
}

main();
