import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type ContactPhoto,
  ContactPhotoCache,
  downloadContactPhoto,
  MISSING_TTL_MS,
  PHOTO_TTL_MS,
} from "../src/modules/whatsapp/contact-photo.js";

/**
 * Foto de perfil do WhatsApp da cliente (decisão de 2026-10-15): buscada sob
 * demanda, só em memória, sem rajada de consultas ao WhatsApp e baixada só da
 * CDN do WhatsApp.
 */
const photo: ContactPhoto = {
  body: Buffer.from([1, 2, 3]),
  contentType: "image/jpeg",
};

function clock(start = 0) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("ContactPhotoCache", () => {
  it("reuses a found photo until it expires", async () => {
    const time = clock();
    const cache = new ContactPhotoCache(time.now);
    const load = vi.fn(async () => photo);

    expect(await cache.get("t1:5511999990000", load)).toBe(photo);
    time.advance(PHOTO_TTL_MS - 1);
    expect(await cache.get("t1:5511999990000", load)).toBe(photo);
    expect(load).toHaveBeenCalledTimes(1);

    time.advance(1);
    await cache.get("t1:5511999990000", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("retries a missing photo sooner, so it can show up after the first chat", async () => {
    const time = clock();
    const cache = new ContactPhotoCache(time.now);
    const load = vi.fn<() => Promise<ContactPhoto | null>>(async () => null);

    expect(await cache.get("t1:5511999990000", load)).toBeNull();
    time.advance(MISSING_TTL_MS - 1);
    expect(await cache.get("t1:5511999990000", load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);

    load.mockResolvedValueOnce(photo);
    time.advance(1);
    expect(await cache.get("t1:5511999990000", load)).toBe(photo);
    expect(MISSING_TTL_MS).toBeLessThan(PHOTO_TTL_MS);
  });

  it("treats a failed lookup as no photo and reports it", async () => {
    const onError = vi.fn();
    const cache = new ContactPhotoCache(Date.now, onError);
    const load = vi.fn(async () => {
      throw new Error("the user has hidden their profile picture from you");
    });

    expect(await cache.get("t1:5511999990000", load)).toBeNull();
    expect(await cache.get("t1:5511999990000", load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("keeps tenants apart", async () => {
    const cache = new ContactPhotoCache();
    const other: ContactPhoto = { ...photo, contentType: "image/png" };

    expect(await cache.get("t1:5511999990000", async () => photo)).toBe(photo);
    expect(await cache.get("t2:5511999990000", async () => other)).toBe(other);
  });

  it("joins concurrent requests for the same contact into one lookup", async () => {
    const cache = new ContactPhotoCache();
    const load = vi.fn(async () => photo);

    const results = await Promise.all([
      cache.get("t1:5511999990000", load),
      cache.get("t1:5511999990000", load),
    ]);

    expect(results).toEqual([photo, photo]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never runs more than three lookups at once", async () => {
    const cache = new ContactPhotoCache();
    let running = 0;
    let peak = 0;
    const load = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return photo;
    };

    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        cache.get(`t1:55119999900${String(index).padStart(2, "0")}`, load),
      ),
    );

    expect(peak).toBe(3);
  });
});

describe("downloadContactPhoto", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response: Response) {
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("downloads an image from the WhatsApp CDN", async () => {
    stubFetch(
      new Response(new Uint8Array([9, 8, 7]), {
        headers: { "content-type": "image/jpeg" },
      }),
    );

    const result = await downloadContactPhoto(
      "https://pps.whatsapp.net/v/t61/abc.jpg?oe=6720A1B2",
    );

    expect(result?.contentType).toBe("image/jpeg");
    expect([...(result?.body ?? [])]).toEqual([9, 8, 7]);
  });

  it("requests the configured CDN origin, taking only path and signature from the link", async () => {
    const fetchMock = stubFetch(
      new Response(new Uint8Array([1]), {
        headers: { "content-type": "image/jpeg" },
      }),
    );

    await downloadContactPhoto(
      "https://someone:secret@pps.whatsapp.net/v/t61/abc.jpg?oe=6720A1B2#x",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(String(target)).toBe(
      "https://pps.whatsapp.net/v/t61/abc.jpg?oe=6720A1B2",
    );
    expect(init.redirect).toBe("error");
  });

  it("refuses links outside the WhatsApp CDN without fetching them", async () => {
    const fetchMock = stubFetch(new Response("x"));

    for (const url of [
      "https://mmg.whatsapp.net/v/abc.jpg",
      "https://pps.whatsapp.net:8443/v/abc.jpg",
      "http://pps.whatsapp.net/v/abc.jpg",
      "https://evil.example/whatsapp.net.jpg",
      "https://whatsapp.net.evil.example/abc.jpg",
      "not a url",
    ]) {
      expect(await downloadContactPhoto(url)).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a response that is not an image", async () => {
    stubFetch(
      new Response("<html></html>", {
        headers: { "content-type": "text/html" },
      }),
    );

    expect(
      await downloadContactPhoto("https://pps.whatsapp.net/v/abc.jpg"),
    ).toBeNull();
  });
});
