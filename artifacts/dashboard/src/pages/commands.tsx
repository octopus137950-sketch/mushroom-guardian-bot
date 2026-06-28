import React, { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { BookOpen, Search, ChevronDown, ChevronUp } from "lucide-react";

interface CommandEntry {
  name: string;
  description: string;
  adminOnly?: boolean;
}

interface Category {
  emoji: string;
  title: string;
  color: string;
  commands: CommandEntry[];
}

const CATEGORIES: Category[] = [
  {
    emoji: "🍄",
    title: "เห็ด / Mushroom",
    color: "from-amber-500/20 to-yellow-500/10 border-amber-500/30",
    commands: [
      { name: "/mushroom fact", description: "แสดงความรู้เรื่องเห็ดแบบสุ่ม 1 ข้อ" },
      { name: "/mushroom type", description: "สุ่มชนิดเห็ดที่น่าสนใจพร้อมข้อมูล" },
    ],
  },
  {
    emoji: "🛡️",
    title: "มอเดอเรชั่น / Moderation",
    color: "from-blue-500/20 to-cyan-500/10 border-blue-500/30",
    commands: [
      { name: "/warn <user> <reason>", description: "ตักเตือนสมาชิก พร้อมบันทึกประวัติ", adminOnly: true },
      { name: "/warnlist <user>", description: "ดูประวัติคำเตือนของสมาชิก", adminOnly: true },
      { name: "/kick <user>", description: "เตะสมาชิกออกจากเซิร์ฟเวอร์", adminOnly: true },
      { name: "/ban <user>", description: "แบนสมาชิกออกจากเซิร์ฟเวอร์อย่างถาวร", adminOnly: true },
      { name: "/timeout <user> <minutes>", description: "ปิดเสียงสมาชิกชั่วคราว", adminOnly: true },
      { name: "/clear <amount>", description: "ลบข้อความในห้องจำนวนที่กำหนด", adminOnly: true },
      { name: "/serverinfo", description: "แสดงข้อมูลเซิร์ฟเวอร์ทั้งหมด" },
      { name: "/help", description: "แสดงรายการคำสั่งทั้งหมดในบอท" },
    ],
  },
  {
    emoji: "🌾",
    title: "มินิเกมฟาร์ม / Farm Minigame",
    color: "from-green-500/20 to-emerald-500/10 border-green-500/30",
    commands: [
      { name: "/farm", description: "ออกฟาร์มเก็บสปอร์ มีโอกาสเจอมอนสเตอร์! (cooldown 60s)" },
      { name: "/wallet [user]", description: "ดูกระเป๋าสปอร์ของตัวเองหรือสมาชิกอื่น" },
      { name: "/daily", description: "เช็คอินรับสปอร์รายวัน พร้อม streak bonus" },
      { name: "/leaderboard", description: "อันดับผู้เล่น Top 10 ในเซิร์ฟเวอร์" },
      { name: "/shop", description: "ดูรายการสินค้าในร้านค้า" },
      { name: "/buy <item>", description: "ซื้อสินค้าจากร้านค้า" },
      { name: "/give-spore <user> <amount>", description: "แจกสปอร์ให้สมาชิก", adminOnly: true },
      { name: "/set-spore <user> <amount>", description: "ตั้งค่าสปอร์ของสมาชิก", adminOnly: true },
      { name: "/farm-config", description: "ตั้งค่าระบบมินิเกม (รางวัล, cooldown ฯลฯ)", adminOnly: true },
      { name: "/shop-item", description: "เพิ่ม/ลบ/แก้ไขสินค้าในร้าน (add/remove/edit/list)", adminOnly: true },
      { name: "/channel-config", description: "กำหนดห้องสำหรับฟาร์ม, คาสิโน, log", adminOnly: true },
    ],
  },
  {
    emoji: "🎰",
    title: "คาสิโน / Casino",
    color: "from-yellow-500/20 to-orange-500/10 border-yellow-500/30",
    commands: [
      { name: "/casino-setup", description: "ติดตั้งแผงคาสิโน Slot Machine ในห้องปัจจุบัน", adminOnly: true },
      { name: "/casino-remove", description: "ถอดแผงคาสิโนออกจากเซิร์ฟเวอร์", adminOnly: true },
    ],
  },
  {
    emoji: "💹",
    title: "เทรด / Trading",
    color: "from-teal-500/20 to-cyan-500/10 border-teal-500/30",
    commands: [
      {
        name: "/trade-setup",
        description: "ติดตั้งแผงเทรดในห้อง — มีปุ่ม 'เทรด' สำหรับดูราคา crypto/forex + สัญญาณ BUY/SELL",
        adminOnly: true,
      },
      { name: "/trade-remove", description: "ถอดแผงเทรดออกจากเซิร์ฟเวอร์", adminOnly: true },
    ],
  },
  {
    emoji: "🎭",
    title: "ระบบต้อนรับ & ยศ / Welcome & Roles",
    color: "from-purple-500/20 to-violet-500/10 border-purple-500/30",
    commands: [
      {
        name: "/welcome setup/disable/remove/test/info",
        description: "ตั้งค่าข้อความต้อนรับสมาชิกใหม่แบบ embed พร้อมรูปภาพ",
        adminOnly: true,
      },
      {
        name: "/goodbye setup/disable/remove/test/info",
        description: "ตั้งค่าข้อความลาก่อนเมื่อสมาชิกออกจากเซิร์ฟเวอร์",
        adminOnly: true,
      },
      {
        name: "/chat-welcome setup/disable/remove/test/info",
        description: "ต้อนรับสมาชิกใหม่แบบข้อความธรรมดาในแชท",
        adminOnly: true,
      },
      {
        name: "/reactionrole create/add/remove/delete/list",
        description: "สร้างระบบรับยศผ่านการกดอิโมจิ (Reaction Roles)",
        adminOnly: true,
      },
    ],
  },
  {
    emoji: "🗑️",
    title: "ลบข้อความอัตโนมัติ / Auto-delete",
    color: "from-red-500/20 to-rose-500/10 border-red-500/30",
    commands: [
      {
        name: "/autodelete set <seconds> [channel]",
        description: "เปิดลบข้อความอัตโนมัติหลังจากเวลาที่กำหนด (5–3600 วินาที)",
        adminOnly: true,
      },
      { name: "/autodelete off [channel]", description: "ปิดลบข้อความอัตโนมัติในห้องที่กำหนด", adminOnly: true },
      { name: "/autodelete list", description: "ดูรายการห้องที่เปิดลบอัตโนมัติอยู่ทั้งหมด", adminOnly: true },
    ],
  },
];

interface CategoryCardProps {
  category: Category;
  filter: string;
}

function CategoryCard({ category, filter }: CategoryCardProps) {
  const [open, setOpen] = useState(true);

  const filtered = category.commands.filter(
    (c) =>
      filter === "" ||
      c.name.toLowerCase().includes(filter.toLowerCase()) ||
      c.description.toLowerCase().includes(filter.toLowerCase())
  );

  if (filtered.length === 0) return null;

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${category.color} backdrop-blur-sm overflow-hidden`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{category.emoji}</span>
          <h2 className="font-display font-bold text-lg text-foreground">{category.title}</h2>
          <span className="text-xs font-medium text-muted-foreground bg-white/10 px-2 py-0.5 rounded-full">
            {filtered.length} คำสั่ง
          </span>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {filtered.map((cmd) => (
            <div
              key={cmd.name}
              className="flex items-start gap-3 px-4 py-3 rounded-xl bg-black/20 hover:bg-black/30 transition-colors"
            >
              <code className="shrink-0 text-sm font-mono text-primary font-semibold mt-0.5 leading-tight">
                {cmd.name}
              </code>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground leading-snug">{cmd.description}</p>
              </div>
              {cmd.adminOnly && (
                <span className="shrink-0 text-xs font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full mt-0.5">
                  แอดมิน
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Commands() {
  const [filter, setFilter] = useState("");

  const totalCommands = CATEGORIES.reduce((s, c) => s + c.commands.length, 0);
  const adminCommands = CATEGORIES.reduce((s, c) => s + c.commands.filter((cmd) => cmd.adminOnly).length, 0);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-10">
        {/* Header */}
        <section className="text-center py-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 border border-primary/40 mb-6">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-4">
            Command <span className="text-primary glow-text">Reference</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-6">
            คำสั่ง Slash Command ทั้งหมดของ Mushroom Guardian พร้อมคำอธิบาย
          </p>
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary" />
              {totalCommands} คำสั่งทั้งหมด
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              {adminCommands} ต้องสิทธิ์แอดมิน
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              {totalCommands - adminCommands} ใช้ได้ทุกคน
            </span>
          </div>
        </section>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="ค้นหาคำสั่ง..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-black/30 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ล้าง
            </button>
          )}
        </div>

        {/* Categories */}
        <div className="space-y-4">
          {CATEGORIES.map((cat) => (
            <CategoryCard key={cat.title} category={cat} filter={filter} />
          ))}
          {filter && CATEGORIES.every((c) => c.commands.filter((cmd) => cmd.name.toLowerCase().includes(filter.toLowerCase()) || cmd.description.toLowerCase().includes(filter.toLowerCase())).length === 0) && (
            <div className="text-center py-16 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg">ไม่พบคำสั่งที่ตรงกับ &ldquo;{filter}&rdquo;</p>
            </div>
          )}
        </div>

        {/* Placeholder note */}
        <p className="text-center text-xs text-muted-foreground pb-6">
          Placeholder ที่ใช้ได้ในข้อความต้อนรับ:{" "}
          <code className="text-primary">&#123;user&#125;</code>{" "}
          <code className="text-primary">&#123;username&#125;</code>{" "}
          <code className="text-primary">&#123;server&#125;</code>{" "}
          <code className="text-primary">&#123;count&#125;</code>
        </p>
      </div>
    </AppLayout>
  );
}
