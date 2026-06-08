export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "GET") {
    response.status(404).json({
      ok: false,
      persisted: false,
      message: "Persistent server state is not available on this Vercel deployment.",
    });
    return;
  }

  if (request.method === "PUT") {
    response.status(202).json({
      ok: true,
      persisted: false,
      message: "State was accepted by the browser, but Vercel does not persist file writes for this app.",
    });
    return;
  }

  response.setHeader("Allow", "GET, PUT");
  response.status(405).json({ ok: false, error: "Method not allowed" });
}
