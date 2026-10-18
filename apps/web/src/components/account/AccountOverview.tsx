"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronRight, Crown, Heart, MapPin, Package } from "lucide-react";
import { ProductCard } from "@/components/ui/ProductCard/ProductCard";
import { demoOrders, demoProfile } from "@/lib/account";
import { createApiAddressBook } from "@/lib/addressBook";
import { apiRoot, authMode, useSession } from "@/lib/auth";
import { useBag } from "@/lib/bag";
import { homeProducts } from "@/lib/catalog";
import { AccountShell } from "./AccountShell";
import { EmailVerifyNotice } from "./EmailVerifyNotice";
import styles from "./AccountPages.module.css";

const memberSince = (iso: string | undefined) => {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "";
};

export function AccountOverview() {
  const bag = useBag();
  const { user } = useSession();
  // Sample data (tier, counts, orders, wishlist) is for the design preview only. With real accounts, show only what is true.
  const preview = authMode === "demo";
  // No order service exists yet (orders belong to the ERP), so a real customer has none to show.
  const recent = preview ? demoOrders.slice(0, 3) : [];
  const [addressCount, setAddressCount] = useState<number | null>(null);

  // the customer's own address book: the session cookie scopes the answer to them
  useEffect(() => {
    if (preview || !user) return;
    let current = true;
    createApiAddressBook(apiRoot)
      .list()
      .then((addresses) => current && setAddressCount(addresses.length))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [preview, user]);

  const since = preview ? demoProfile.memberSince : memberSince(user?.createdAt);

  return (
    <AccountShell active="overview" title="My Account" subtitle="Manage your orders, addresses and more">
      <EmailVerifyNotice />
      <div className={styles.profile}>
        <Image className={styles.profileMark} src="/images/figma/lotus-emblem.svg" alt="" width={150} height={150} />
        <span className={styles.avatar}>
          {preview ? (
            <Image src={demoProfile.avatar} alt="" fill sizes="88px" style={{ objectFit: "cover", objectPosition: "center top" }} />
          ) : user?.picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- the Google profile picture lives on another host
            <img src={user.picture} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span className={styles.avatarInitial} aria-hidden="true">{user?.name.trim().charAt(0).toUpperCase()}</span>
          )}
        </span>
        <div>
          <h2>Hello, {user ? user.name.split(" ")[0] : demoProfile.name}</h2>
          <p>Welcome to Pratyangi Fashions</p>
          <div className={styles.profileMeta}>
            {preview && <span className={styles.tier}>{demoProfile.tier}</span>}
            {since && <span>{preview ? "Since" : "Member since"} {since}</span>}
          </div>
        </div>
      </div>

      <div className={`${styles.stats} ${preview ? "" : styles.statsFew}`}>
        <div className={`${styles.stat} ${styles.statOrders}`}>
          <span className={styles.statIcon}><Package size={16} /></span>
          <span><strong>{preview ? demoProfile.totalOrders : recent.length}</strong>Total orders</span>
        </div>
        {preview && (
          <div className={`${styles.stat} ${styles.statWishlist}`}>
            <span className={styles.statIcon}><Heart size={16} /></span>
            <span><strong>{demoProfile.wishlistItems}</strong>Wishlist Items</span>
          </div>
        )}
        <div className={`${styles.stat} ${styles.statAddresses}`}>
          <span className={styles.statIcon}><MapPin size={16} /></span>
          <span><strong>{preview ? demoProfile.savedAddresses : addressCount ?? "–"}</strong>Saved Addresses</span>
        </div>
        {preview && (
          <div className={`${styles.stat} ${styles.statMembership}`}>
            <span className={styles.statIcon}><Crown size={16} /></span>
            <span><strong>{demoProfile.membership}</strong>Membership</span>
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Recent Orders</h2>
          <Link href="/account/orders" className={styles.linkMuted}>View All Orders <ArrowRight size={14} /></Link>
        </div>
        {recent.length === 0 && (
          <div className={styles.emptyState}>
            <p>No orders yet</p>
            <p>When you place an order, it will appear here.</p>
            <Link href="/new-arrivals" className={styles.linkMuted}>Start shopping <ArrowRight size={14} /></Link>
          </div>
        )}
        {recent.map((order) => (
          <div className={styles.orderRow} key={order.id}>
            <span className={styles.thumb}>
              <Image src={order.items[0].image} alt="" fill sizes="56px" />
            </span>
            <div>
              <strong>{order.items[0].name}</strong>
              Order #{order.id}<br />Placed on {order.placedOn}
            </div>
            <div className={styles.status}>
              <span className={`${styles.statusLabel} ${styles[order.status]}`}>{order.status[0].toUpperCase() + order.status.slice(1)}</span>
              {order.statusNote}
            </div>
            <button type="button" className={styles.ghostButton} disabled title="Order details are not available in this demo">
              {order.status === "shipped" ? "Track Order" : "View Details"} <ChevronRight size={13} />
            </button>
          </div>
        ))}
      </div>

      {preview && (
        <>
          <div className={styles.sectionHead}>
            <h2>Wishlist</h2>
            <span className={styles.linkMuted} aria-disabled="true" title="Wishlist is not available yet">View Wishlist <ArrowRight size={14} /></span>
          </div>
          <div className={styles.wishlist}>
            {homeProducts.slice(0, 3).map((product) => (
              <ProductCard
                key={product.id}
                id={product.id}
                title={product.name}
                imageSrc={product.image}
                priceInr={product.priceInr}
                compareAtInr={product.compareAtInr}
                onAddToCart={bag.add}
              />
            ))}
          </div>
        </>
      )}
    </AccountShell>
  );
}
