// netlify/functions/listTickets.js

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Supabase env vars missing" })
    };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch tickets" })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ tickets: data })
  };
};
