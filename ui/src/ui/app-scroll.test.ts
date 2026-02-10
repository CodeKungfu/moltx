import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleChatScroll, scheduleChatScroll, resetChatScroll } from "./app-scroll.ts";

/* ------------------------------------------------------------------ */
/*  辅助函数                                                            */
/* ------------------------------------------------------------------ */

/** 单元测试的最小 ScrollHost 存根。 */
function createScrollHost(
  overrides: {
    scrollHeight?: number;
    scrollTop?: number;
    clientHeight?: number;
    overflowY?: string;
  } = {},
) {
  const {
    scrollHeight = 2000,
    scrollTop = 1500,
    clientHeight = 500,
    overflowY = "auto",
  } = overrides;

  const container = {
    scrollHeight,
    scrollTop,
    clientHeight,
    style: { overflowY } as unknown as CSSStyleDeclaration,
  };

  // 使 getComputedStyle 返回 overflowY 值
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    overflowY,
  } as unknown as CSSStyleDeclaration);

  const host = {
    updateComplete: Promise.resolve(),
    querySelector: vi.fn().mockReturnValue(container),
    style: { setProperty: vi.fn() } as unknown as CSSStyleDeclaration,
    chatScrollFrame: null as number | null,
    chatScrollTimeout: null as number | null,
    chatHasAutoScrolled: false,
    chatUserNearBottom: true,
    chatNewMessagesBelow: false,
    logsScrollFrame: null as number | null,
    logsAtBottom: true,
    topbarObserver: null as ResizeObserver | null,
  };

  return { host, container };
}

function createScrollEvent(scrollHeight: number, scrollTop: number, clientHeight: number) {
  return {
    currentTarget: { scrollHeight, scrollTop, clientHeight },
  } as unknown as Event;
}

/* ------------------------------------------------------------------ */
/*  handleChatScroll – 阈值测试                                         */
/* ------------------------------------------------------------------ */

describe("handleChatScroll", () => {
  it("sets chatUserNearBottom=true when within the 450px threshold", () => {
    const { host } = createScrollHost({});
    // 距底部距离 = 2000 - 1600 - 400 = 0 → 显然接近底部
    const event = createScrollEvent(2000, 1600, 400);
    handleChatScroll(host, event);
    expect(host.chatUserNearBottom).toBe(true);
  });

  it("sets chatUserNearBottom=true when distance is just under threshold", () => {
    const { host } = createScrollHost({});
    // 距底部距离 = 2000 - 1151 - 400 = 449 → 刚好低于阈值
    const event = createScrollEvent(2000, 1151, 400);
    handleChatScroll(host, event);
    expect(host.chatUserNearBottom).toBe(true);
  });

  it("sets chatUserNearBottom=false when distance is exactly at threshold", () => {
    const { host } = createScrollHost({});
    // 距底部距离 = 2000 - 1150 - 400 = 450 → 处于阈值（使用严格 <）
    const event = createScrollEvent(2000, 1150, 400);
    handleChatScroll(host, event);
    expect(host.chatUserNearBottom).toBe(false);
  });

  it("sets chatUserNearBottom=false when scrolled well above threshold", () => {
    const { host } = createScrollHost({});
    // 距底部距离 = 2000 - 500 - 400 = 1100 → 远高于阈值
    const event = createScrollEvent(2000, 500, 400);
    handleChatScroll(host, event);
    expect(host.chatUserNearBottom).toBe(false);
  });

  it("sets chatUserNearBottom=false when user scrolled up past one long message (>200px <450px)", () => {
    const { host } = createScrollHost({});
    // 距底部距离 = 2000 - 1250 - 400 = 350 → 旧阈值会说“近”，新阈值说“近”
    // 距底部距离 = 2000 - 1100 - 400 = 500 → 旧阈值会说“不近”，新阈值也说“不近”
    const event = createScrollEvent(2000, 1100, 400);
    handleChatScroll(host, event);
    expect(host.chatUserNearBottom).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  scheduleChatScroll – 尊重用户滚动位置                               */
/* ------------------------------------------------------------------ */

describe("scheduleChatScroll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("scrolls to bottom when user is near bottom (no force)", async () => {
    const { host, container } = createScrollHost({
      scrollHeight: 2000,
      scrollTop: 1600,
      clientHeight: 400,
    });
    // 距底部距离 = 2000 - 1600 - 400 = 0 → 接近底部
    host.chatUserNearBottom = true;

    scheduleChatScroll(host);
    await host.updateComplete;

    expect(container.scrollTop).toBe(container.scrollHeight);
  });

  it("does NOT scroll when user is scrolled up and no force", async () => {
    const { host, container } = createScrollHost({
      scrollHeight: 2000,
      scrollTop: 500,
      clientHeight: 400,
    });
    // 距底部距离 = 2000 - 500 - 400 = 1100 → 不接近底部
    host.chatUserNearBottom = false;
    const originalScrollTop = container.scrollTop;

    scheduleChatScroll(host);
    await host.updateComplete;

    expect(container.scrollTop).toBe(originalScrollTop);
  });

  it("does NOT scroll with force=true when user has explicitly scrolled up", async () => {
    const { host, container } = createScrollHost({
      scrollHeight: 2000,
      scrollTop: 500,
      clientHeight: 400,
    });
    // 用户已向上滚动 — chatUserNearBottom 为 false
    host.chatUserNearBottom = false;
    host.chatHasAutoScrolled = true; // 已过初始加载
    const originalScrollTop = container.scrollTop;

    scheduleChatScroll(host, true);
    await host.updateComplete;

    // force=true 在初始加载后仍不应覆盖显式用户向上滚动
    expect(container.scrollTop).toBe(originalScrollTop);
  });

  it("DOES scroll with force=true on initial load (chatHasAutoScrolled=false)", async () => {
    const { host, container } = createScrollHost({
      scrollHeight: 2000,
      scrollTop: 500,
      clientHeight: 400,
    });
    host.chatUserNearBottom = false;
    host.chatHasAutoScrolled = false; // 初始加载

    scheduleChatScroll(host, true);
    await host.updateComplete;

    // 在初始加载时，force 应无论如何都起作用
    expect(container.scrollTop).toBe(container.scrollHeight);
  });

  it("sets chatNewMessagesBelow when not scrolling due to user position", async () => {
    const { host } = createScrollHost({
      scrollHeight: 2000,
      scrollTop: 500,
      clientHeight: 400,
    });
    host.chatUserNearBottom = false;
    host.chatHasAutoScrolled = true;
    host.chatNewMessagesBelow = false;

    scheduleChatScroll(host);
    await host.updateComplete;

    expect(host.chatNewMessagesBelow).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  流式传输：快速 chatStream 更改不应重置滚动                           */
/* ------------------------------------------------------------------ */

describe("streaming scroll behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("multiple rapid scheduleChatScroll calls do not scroll when user is scrolled up", async () => {
    const { host, container } = createScrollHost({
      scrollHeight: 2000,
      scrollTop: 500,
      clientHeight: 400,
    });
    host.chatUserNearBottom = false;
    host.chatHasAutoScrolled = true;
    const originalScrollTop = container.scrollTop;

    // 模拟快速流式令牌更新
    scheduleChatScroll(host);
    scheduleChatScroll(host);
    scheduleChatScroll(host);
    await host.updateComplete;

    expect(container.scrollTop).toBe(originalScrollTop);
  });

  it("streaming scrolls correctly when user IS at bottom", async () => {
    const { host, container } = createScrollHost({
      scrollHeight: 2000,
      scrollTop: 1600,
      clientHeight: 400,
    });
    host.chatUserNearBottom = true;
    host.chatHasAutoScrolled = true;

    // 模拟流式传输
    scheduleChatScroll(host);
    await host.updateComplete;

    expect(container.scrollTop).toBe(container.scrollHeight);
  });
});

/* ------------------------------------------------------------------ */
/*  resetChatScroll                                                    */
/* ------------------------------------------------------------------ */

describe("resetChatScroll", () => {
  it("resets state for new chat session", () => {
    const { host } = createScrollHost({});
    host.chatHasAutoScrolled = true;
    host.chatUserNearBottom = false;

    resetChatScroll(host);

    expect(host.chatHasAutoScrolled).toBe(false);
    expect(host.chatUserNearBottom).toBe(true);
  });
});
