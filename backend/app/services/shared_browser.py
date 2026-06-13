"""共享 Playwright 浏览器实例管理 —— 每线程单例，避免 greenlet 跨线程切换错误"""
import asyncio
import logging
import sys
import threading

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

logger = logging.getLogger(__name__)

# 每线程独立的浏览器实例，避免 Playwright sync API 的 greenlet 跨线程切换错误
_thread_local = threading.local()
# 全局记录所有实例，便于应用关闭时清理
_all_instances: list = []


def get_shared_browser(headless: bool = True):
    """获取当前线程的 Playwright 浏览器实例（每线程单例）"""
    if not hasattr(_thread_local, "browser") or _thread_local.browser is None:
        from playwright.sync_api import sync_playwright

        pw = sync_playwright().start()
        launch_options = dict(
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
        )
        browser = None
        for channel in ("msedge", "chrome", None):
            try:
                opts = {**launch_options}
                if channel:
                    opts["channel"] = channel
                browser = pw.chromium.launch(**opts)
                logger.info("共享浏览器已启动 (thread=%s channel=%s)", threading.current_thread().name, channel or "chromium")
                break
            except Exception as e:
                logger.debug("浏览器 channel=%s 不可用: %s", channel, e)
                continue

        if browser is None:
            pw.stop()
            raise RuntimeError("无法启动 Playwright 浏览器，无可用 Chromium channel")

        _thread_local.playwright = pw
        _thread_local.browser = browser
        _all_instances.append((pw, browser))

    return _thread_local.browser


def cleanup_shared_browser():
    """应用关闭时清理所有线程的浏览器资源"""
    global _all_instances
    for pw, browser in _all_instances:
        try:
            browser.close()
        except Exception:
            pass
        try:
            pw.stop()
        except Exception:
            pass
    _all_instances.clear()
