import { Form, redirect } from "react-router";
export function loader({ request }) {
  const url = new URL(request.url);
  if (url.searchParams.has("shop")) throw redirect(`/app?${url.searchParams}`);
  return null;
}
export default function Home() {
  return <main style={{ maxWidth: 680, margin: "64px auto", padding: 24, fontFamily: "sans-serif" }}>
    <h1>Automation Recommendations</h1>
    <p>Find product improvements and stock issues, then review each action in Shopify.</p>
    <Form method="post" action="/auth/login">
      <label htmlFor="shop">Shop domain</label><br />
      <input id="shop" name="shop" placeholder="your-store.myshopify.com" required />
      <button type="submit">Open app</button>
    </Form>
  </main>;
}
