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
  // 1. Find the review for Minesh Singh (period Q2 2026)
  const { data: reviews, error: revError } = await supabase
    .from('kpi_reviews')
    .select(`
      id,
      employee_id,
      employees (first_name, last_name)
    `)
    .eq('period', 'Q2 2026');

  if (revError || !reviews || reviews.length === 0) {
    console.error("Error finding Q2 2026 review:", revError);
    return;
  }

  const review = reviews.find(r => r.employees && r.employees.first_name.includes('Minesh'));
  if (!review) {
    console.error("Could not find Q2 2026 review for Minesh.");
    return;
  }

  console.log(`Found Minesh's Q2 2026 Review ID: ${review.id}`);

  // 2. Find Divya's employee record
  const { data: divya, error: divyaError } = await supabase
    .from('employees')
    .select('id, first_name, last_name')
    .eq('first_name', 'Divya Gauri')
    .single();

  if (divyaError || !divya) {
    console.error("Error finding Divya's employee record:", divyaError);
    return;
  }

  console.log(`Found Divya's Employee ID: ${divya.id}`);

  // 3. Find Divya's invitee row for this review
  const { data: invitee, error: invError } = await supabase
    .from('kpi_review_invitees')
    .select('id, status')
    .eq('review_id', review.id)
    .eq('invitee_id', divya.id)
    .single();

  if (invError || !invitee) {
    console.error("Error finding Divya's invitee row:", invError);
    return;
  }

  console.log(`Found invitee row: ${invitee.id} with status ${invitee.status}`);

  // 4. Update invitee status to accepted (or completed if we finish scoring)
  await supabase
    .from('kpi_review_invitees')
    .update({ status: 'accepted' })
    .eq('id', invitee.id);

  // 5. Fetch all items in the kpi_template_items table to score them
  const { data: items, error: itemsError } = await supabase
    .from('kpi_template_items')
    .select('id, title, max_score, section_id, kpi_template_sections(type)');

  if (itemsError || !items) {
    console.error("Error fetching template items:", itemsError);
    return;
  }

  console.log(`Found ${items.length} template items.`);

  // Filter items that are scored by peers. Peer items are in sections of type 'personal' or 'department' or 'values'
  // (Usually sections of type 'hr' are scored only by HR, but peers score personal, department, and values sections)
  const peerScoredItems = items.filter(item => {
    const sectionType = item.kpi_template_sections?.type;
    return sectionType !== 'hr';
  });

  console.log(`Found ${peerScoredItems.length} peer-scored items.`);

  // 6. Insert scores for all peer-scored items
  const scoresToInsert = peerScoredItems.map(item => ({
    review_id: review.id,
    item_id: item.id,
    scorer_id: divya.id,
    score: Math.floor(Math.random() * (item.max_score - (item.max_score > 5 ? 7 : 4) + 1)) + (item.max_score > 5 ? 7 : 4), // realistic score
    comments: `Demonstrates high level of capability in ${item.title || 'this area'}.`,
    updated_at: new Date().toISOString()
  }));

  console.log(`Upserting ${scoresToInsert.length} scores...`);
  const { error: upsertError } = await supabase
    .from('kpi_scores')
    .upsert(scoresToInsert, { onConflict: 'review_id,item_id,scorer_id' });

  if (upsertError) {
    console.error("Error upserting scores:", upsertError);
    return;
  }

  // 7. Update invitee status to completed
  const { error: completeError } = await supabase
    .from('kpi_review_invitees')
    .update({ status: 'completed' })
    .eq('id', invitee.id);

  if (completeError) {
    console.error("Error completing invitee status:", completeError);
    return;
  }

  console.log("Successfully populated peer scores and set status to completed!");
}

main();
