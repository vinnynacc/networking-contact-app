export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  // Forward payload to BONZO webhook:
  const r = await fetch("https://app.getbonzo.com/api/webhook/b0c3c461189224a84f008aa29054a087", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body),
  });
  res.status(r.status).end();
}
