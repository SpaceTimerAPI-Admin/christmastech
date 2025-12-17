// netlify/functions/listTickets.js
const { getSb } = require("./sb");
const { ok, bad, server } = require("./_lib");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return ok({});
  if (event.httpMethod !== "GET") return bad("Use GET");

  try {
    const sb = getSb();
    const { data, error } = await sb
      .from("tickets")
      .select("id,tech_name,created_at,status,location_friendly,description,lat,lon")
      .order("created_at", { ascending: false });

    if (error) return server("List tickets failed", { details: error.message });
    return ok({ tickets: data || [] });
  } catch (e) {
    return server("List tickets error", { details: String(e?.message || e) });
  }
};
