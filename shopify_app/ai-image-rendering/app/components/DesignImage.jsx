import { useEffect, useState } from "react";

// Plain links open outside the embedded admin without a session token, so images are
// fetched through App Bridge, which adds the merchant's session token to same-origin fetches.
// eslint-disable-next-line react/prop-types
export function DesignImage({ src, label }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    setUrl(null);
    setFailed(false);
    fetch(src, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (failed) return <s-paragraph>{label} is unavailable.</s-paragraph>;
  if (!url) return <s-spinner accessibilityLabel={"Loading " + label} />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt={label} width="240" height="240" style={{ objectFit: "contain" }} />
    </a>
  );
}
