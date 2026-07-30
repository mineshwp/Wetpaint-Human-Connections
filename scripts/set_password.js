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
  const userId = '30a77b62-a476-45ae-aaec-dd9b8d35a260';
  const newPassword = 'WetpaintPass2026!';
  console.log(`Setting password for user ${userId} (${newPassword})...`);

  try {
    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (error) {
      console.error("Error setting password:", error.message);
    } else {
      console.log("Password set successfully!");
    }
  } catch (e) {
    console.error("Exception occurred:", e.message);
  }
}

main();
