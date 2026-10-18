"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Search } from "lucide-react";
import { allDemoOrders, formatOrderTotal, type DemoOrder } from "@/lib/account";
import { authMode } from "@/lib/auth";
import { useBag } from "@/lib/bag";
import { easeOutExpo } from "@/lib/motion/presets";
import { AccountShell } from "./AccountShell";
import styles from "./AccountPages.module.css";

const pageSize = 4;

/** No order service exists yet (orders belong to the ERP), so real customers have none. The sample orders are for the design preview only. */
const noOrders: DemoOrder[] = [];

/** Page numbers to show, e.g. 1 2 3 4 5 … 13, or 1 … 6 7 8 … 13 when in the middle. */
function pageItems(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "gap", total];
  if (current >= total - 3) return [1, "gap", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "gap", current - 1, current, current + 1, "gap", total];
}

export function OrdersView() {
  const bag = useBag();
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "oldest">("recent");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");

  const preview = authMode === "demo";
  const orders = preview ? allDemoOrders : noOrders;
  const term = query.trim().toLowerCase();
  const matching = orders.filter((order) => !term || order.id.toLowerCase().includes(term) || order.items.some((item) => item.name.toLowerCase().includes(term)));
  // the demo orders are already newest-first
  const ordered = sort === "recent" ? matching : [...matching].reverse();
  const totalPages = Math.max(1, Math.ceil(ordered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = ordered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const goToPage = (next: number) => {
    setPage(next);
    document.getElementById("orders-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const controls = (
    <div className={styles.toolbar}>
      <label className={styles.search}>
        <Search size={17} aria-hidden="true" />
        <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search your orders (e.g. saree, order ID...)" aria-label="Search your orders" />
      </label>
      <label className={styles.sort}>
        Sort by
        <select value={sort} onChange={(event) => { setSort(event.target.value as "recent" | "oldest"); setPage(1); }}>
          <option value="recent">Recent First</option>
          <option value="oldest">Oldest First</option>
        </select>
      </label>
    </div>
  );

  return (
    <AccountShell active="orders" title="My Orders" subtitle="Track, return or buy again from your past orders." headerActions={orders.length > 0 ? controls : undefined}>
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      <div id="orders-list">
        {orders.length === 0 && (
          <div className={styles.emptyState}>
            <p>No orders yet</p>
            <p>When you place an order, it will appear here.</p>
            <Link href="/new-arrivals" className={styles.linkMuted}>Start shopping</Link>
          </div>
        )}
        {orders.length > 0 && visible.length === 0 && <p className={styles.emptyState}>No orders match your search.</p>}

        {/* a new page of orders slides in as the page numbers are used */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${currentPage}-${sort}-${term}`}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: easeOutExpo }}
          >
            {visible.map((order, index) => {
              const [first, ...rest] = order.items;
              const count = order.items.length;
              return (
                <motion.article
                  className={styles.orderCard}
                  key={order.id}
                  initial={{ opacity: 0, y: 28 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: false, amount: 0.15 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.6, ease: easeOutExpo, delay: index * 0.08 }}
                >
                  <div>
                    <div className={styles.orderId}>Order ID #{order.id}</div>
                    <div className={styles.orderMeta}>
                      <span>Placed on {order.placedOn}</span>
                      <span>{count} {count === 1 ? "item" : "items"}</span>
                      <span><b>{formatOrderTotal(order.total)}</b></span>
                    </div>
                    {count === 1 ? (
                      <div className={styles.single}>
                        <span className={styles.thumb}><Image src={first.image} alt="" fill sizes="80px" /></span>
                        <span>
                          <strong>{first.name}</strong>
                          <small>{first.subtitle}<br />Qty: {first.quantity} &nbsp;|&nbsp; Size: Free Size</small>
                        </span>
                      </div>
                    ) : (
                      <div className={styles.thumbs}>
                        {[first, ...rest.slice(0, 2)].map((item, thumbIndex) => (
                          <span className={styles.thumb} key={`${item.productId}-${thumbIndex}`}><Image src={item.image} alt="" fill sizes="80px" /></span>
                        ))}
                        {count > 3 && <span className={styles.more}><b>+{count - 3}</b>More Items</span>}
                      </div>
                    )}
                  </div>
                  <div className={styles.status}>
                    <span className={`${styles.statusLabel} ${styles[order.status]}`}>{order.status[0].toUpperCase() + order.status.slice(1)}</span>
                    {order.statusNote}
                  </div>
                  <div className={styles.actions}>
                    <button type="button" className={styles.ghostButton} disabled title="Order details are not available in this demo">View Details <ChevronRight size={13} /></button>
                    {order.status === "shipped" ? (
                      <button type="button" className={styles.solidButton} disabled title="Tracking is not available in this demo">Track Order</button>
                    ) : (
                      <button
                        type="button"
                        className={styles.solidButton}
                        onClick={() => {
                          bag.add(first.productId);
                          setNotice(`${first.name} added to your bag.`);
                        }}
                      >
                        Buy Again
                      </button>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {totalPages > 1 && (
        <motion.nav
          className={styles.pagination}
          aria-label="Order pages"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 0.5 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.5, ease: easeOutExpo }}
        >
          <button type="button" className={`${styles.pageButton} ${styles.pageArrow}`} aria-label="Previous page" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}>‹</button>
          {pageItems(currentPage, totalPages).map((item, index) =>
            item === "gap" ? (
              <span className={styles.pageGap} key={`gap-${index}`} aria-hidden="true">…</span>
            ) : (
              <button
                type="button"
                key={item}
                className={styles.pageButton}
                aria-label={`Page ${item}`}
                aria-current={item === currentPage ? "page" : undefined}
                onClick={() => goToPage(item)}
              >
                {item}
              </button>
            ),
          )}
          <button type="button" className={`${styles.pageButton} ${styles.pageArrow}`} aria-label="Next page" disabled={currentPage === totalPages} onClick={() => goToPage(currentPage + 1)}>›</button>
        </motion.nav>
      )}
    </AccountShell>
  );
}
