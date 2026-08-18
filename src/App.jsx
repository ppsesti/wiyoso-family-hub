import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import {
  Check, CheckSquare, CalendarDays, WalletCards, Target, Heart, Users,
  BarChart3, Plus, Trash2, Pencil, X, Save, Clock3, Loader2, Leaf,
  Tag, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight, Sparkles
} from "lucide-react";

/* ---------------- helpers ---------------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);
const money = (n) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(n) || 0);
const dateText = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-");
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const mKey = (d) => (d ? d.slice(0, 7) : "");
const monthLabel = (mk) => { const [y, m] = mk.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };
const shiftMonth = (mk, delta) => { const [y, m] = mk.split("-").map(Number); const dt = new Date(y, m - 1 + delta, 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; };
const firstDay = (mk) => `${mk}-01`;
const lastDay = (mk) => { const [y, m] = mk.split("-").map(Number); const dt = new Date(y, m, 0); return `${mk}-${String(dt.getDate()).padStart(2, "0")}`; };
const inMonth = (d, mk) => !!d && mKey(d) === mk;
const weekOfMonth = (d) => Math.min(4, Math.ceil(Number(d.slice(8, 10)) / 7));
const pct = (n) => `${Math.round(n)}%`;

/* ---------------- seed data ---------------- */
const starterTasks = [
  { id: uid(), title: "Beli bahan makanan", pic: "Ibu", deadline: today(), time: "11:00", priority: "Tinggi", done: true },
  { id: uid(), title: "Antar anak les piano", pic: "Ayah", deadline: today(), time: "16:00", priority: "Sedang", done: false },
  { id: uid(), title: "Bersihkan kamar utama", pic: "Ibu", deadline: today(), time: "10:00", priority: "Sedang", done: false },
  { id: uid(), title: "Bayar cicilan motor", pic: "Ayah", deadline: today(), time: "12:00", priority: "Tinggi", done: false },
];
const starterMembers = [
  { id: uid(), name: "Ibu", role: "Orang tua", color: "#7C9473" },
  { id: uid(), name: "Ayah", role: "Orang tua", color: "#B98B4E" },
  { id: uid(), name: "Anak", role: "Anak", color: "#8FA37D" },
];
const starterCategories = [
  { id: uid(), name: "Makanan", emoji: "🍚" },
  { id: uid(), name: "Rumah", emoji: "🏠" },
  { id: uid(), name: "Transportasi", emoji: "🚗" },
  { id: uid(), name: "Anak", emoji: "👶" },
  { id: uid(), name: "Cicilan", emoji: "💳" },
  { id: uid(), name: "Kesehatan", emoji: "🩺" },
  { id: uid(), name: "Lainnya", emoji: "📦" },
];

/* ---------------- persistent storage (shared across devices) ---------------- */
function useStored(key, initial) {
  const [v, setV] = useState(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await window.storage.get(key, true);
        if (mounted) setV(res ? JSON.parse(res.value) : initial);
      } catch {
        if (mounted) setV(initial);
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => { mounted = false; };
  }, [key]);
  const update = (fn) => {
    setV((prev) => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      try {
        const r = window.storage && window.storage.set(key, JSON.stringify(next), true);
        if (r && typeof r.catch === "function") r.catch(() => {});
      } catch (e) {
        console.error("storage set failed for", key, e);
      }
      return next;
    });
  };
  return [v, update, ready];
}

/* ---------------- Supabase Tasks ---------------- */
function useSupabaseTasks(initial) {
  const [tasks, setTasksState] = useState([]);
  const [ready, setReady] = useState(false);

  const loadTasks = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Gagal memuat tasks dari Supabase:", error);
      setTasksState(initial);
      setReady(true);
      return;
    }

    // Kalau database masih kosong, pindahkan starter tasks ke Supabase
    if (!data.length && initial.length) {
      const seed = initial.map(({ id, ...task }) => task);

      const { data: inserted, error: insertError } = await supabase
        .from("tasks")
        .insert(seed)
        .select("*");

      if (insertError) {
        console.error("Gagal membuat starter tasks:", insertError);
        setTasksState(initial);
      } else {
        setTasksState(inserted || []);
      }
    } else {
      setTasksState(data || []);
    }

    setReady(true);
  };

  useEffect(() => {
    let mounted = true;

    const start = async () => {
      if (mounted) await loadTasks();
    };

    start();

    const channel = supabase
      .channel("wiyoso-tasks-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
        },
        () => {
          if (mounted) loadTasks();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const setTasks = (updater) => {
    setTasksState((prev) => {
      let next = typeof updater === "function" ? updater(prev) : updater;

      // Pastikan task baru menggunakan UUID yang diterima Supabase
      next = next.map((task) => {
        const isUuid =
          typeof task.id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(task.id);

        return isUuid
          ? task
          : { ...task, id: crypto.randomUUID() };
      });

      const sync = async () => {
        const nextIds = new Set(next.map((x) => x.id));
        const deletedIds = prev
          .filter((x) => !nextIds.has(x.id))
          .map((x) => x.id);

        if (deletedIds.length) {
          const { error } = await supabase
            .from("tasks")
            .delete()
            .in("id", deletedIds);

          if (error) console.error("Gagal menghapus task:", error);
        }

        if (next.length) {
          const rows = next.map((task) => ({
            id: task.id,
            title: task.title,
            pic: task.pic || null,
            deadline: task.deadline || null,
            time: task.time || null,
            priority: task.priority || "Sedang",
            done: !!task.done,
            updated_at: new Date().toISOString(),
          }));

          const { error } = await supabase
            .from("tasks")
            .upsert(rows);

          if (error) console.error("Gagal menyimpan tasks:", error);
        }
      };

      sync();

      return next;
    });
  };

  return [tasks, setTasks, ready];
}

/* ---------------- Supabase Events ---------------- */
function useSupabaseEvents(initial) {
  const [events, setEventsState] = useState([]);
  const [ready, setReady] = useState(false);

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("date", { ascending: true });

    if (error) {
      console.error("Gagal memuat events dari Supabase:", error);
      setEventsState(initial);
      setReady(true);
      return;
    }

    setEventsState(data || []);
    setReady(true);
  };

  useEffect(() => {
    let mounted = true;

    loadEvents();

    const channel = supabase
      .channel("wiyoso-events-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
        },
        () => {
          if (mounted) loadEvents();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const setEvents = (updater) => {
    setEventsState((prev) => {
      let next = typeof updater === "function" ? updater(prev) : updater;

      next = next.map((event) => {
        const isUuid =
          typeof event.id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.id);

        return isUuid
          ? event
          : { ...event, id: crypto.randomUUID() };
      });

      const sync = async () => {
        const nextIds = new Set(next.map((x) => x.id));

        const deletedIds = prev
          .filter((x) => !nextIds.has(x.id))
          .map((x) => x.id);

        if (deletedIds.length) {
          const { error } = await supabase
            .from("events")
            .delete()
            .in("id", deletedIds);

          if (error) {
            console.error("Gagal menghapus event:", error);
          }
        }

        if (next.length) {
          const rows = next.map((event) => ({
            id: event.id,
            title: event.title,
            date: event.date,
            time: event.time || null,
          }));

          const { error } = await supabase
            .from("events")
            .upsert(rows);

          if (error) {
            console.error("Gagal menyimpan events:", error);
          }
        }
      };

      sync();

      return next;
    });
  };

  return [events, setEvents, ready];
}

/* ---------------- Supabase Finance ---------------- */
function useSupabaseFinance(initial) {
  const [finance, setFinanceState] = useState([]);
  const [ready, setReady] = useState(false);

  const loadFinance = async () => {
    const { data, error } = await supabase
      .from("finance")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      console.error("Gagal memuat finance dari Supabase:", error);
      setFinanceState(initial);
      setReady(true);
      return;
    }

    setFinanceState(data || []);
    setReady(true);
  };

  useEffect(() => {
    let mounted = true;

    loadFinance();

    const channel = supabase
      .channel("wiyoso-finance-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "finance",
        },
        () => {
          if (mounted) loadFinance();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const setFinance = (updater) => {
    setFinanceState((prev) => {
      const next =
        typeof updater === "function" ? updater(prev) : updater;

      const normalized = next.map((item) => {
        const isUuid =
          typeof item.id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id);

        return isUuid
          ? item
          : { ...item, id: crypto.randomUUID() };
      });

      const sync = async () => {
        const prevIds = new Set(prev.map((x) => x.id));
        const nextIds = new Set(normalized.map((x) => x.id));

        const deletedIds = prev
          .filter((x) => !nextIds.has(x.id))
          .map((x) => x.id);

        if (deletedIds.length) {
          const { error } = await supabase
            .from("finance")
            .delete()
            .in("id", deletedIds);

          if (error) {
            console.error("Gagal menghapus finance:", error);
          }
        }

        if (normalized.length) {
          const rows = normalized.map((item) => ({
            id: item.id,
            type: item.type,
            cat: item.cat || null,
            desc: item.desc || "",
            amount: Number(item.amount || 0),
            date: item.date,
          }));

          const { error } = await supabase
            .from("finance")
            .upsert(rows);

          if (error) {
            console.error("Gagal menyimpan finance:", error);
          }
        }
      };

      sync();

      return normalized;
    });
  };

  return [finance, setFinance, ready];
}


/* ---------------- Supabase Categories ---------------- */
function useSupabaseCategories(initial) {
  const [categories, setCategoriesState] = useState([]);
  const [ready, setReady] = useState(false);

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from("finance_categories")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("Gagal memuat categories dari Supabase:", error);
      setCategoriesState(initial);
      setReady(true);
      return;
    }

    setCategoriesState(data || []);
    setReady(true);
  };

  useEffect(() => {
    let mounted = true;

    loadCategories();

    const channel = supabase
      .channel("wiyoso-categories-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "finance_categories",
        },
        () => {
          if (mounted) loadCategories();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const setCategories = (updater) => {
    setCategoriesState((prev) => {
      const next =
        typeof updater === "function" ? updater(prev) : updater;

      const normalized = next.map((item) => {
        const isUuid =
          typeof item.id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id);

        return isUuid
          ? item
          : { ...item, id: crypto.randomUUID() };
      });

      const sync = async () => {
        const nextIds = new Set(normalized.map((x) => x.id));

        const deletedIds = prev
          .filter((x) => !nextIds.has(x.id))
          .map((x) => x.id);

        if (deletedIds.length) {
          const { error } = await supabase
            .from("finance_categories")
            .delete()
            .in("id", deletedIds);

          if (error) {
            console.error("Gagal menghapus kategori:", error);
          }
        }

        if (normalized.length) {
          const rows = normalized.map((item) => ({
            id: item.id,
            name: item.name,
            emoji: item.emoji || "📦",
          }));

          const { error } = await supabase
            .from("finance_categories")
            .upsert(rows);

          if (error) {
            console.error("Gagal menyimpan kategori:", error);
          }
        }
      };

      sync();

      return normalized;
    });
  };

  return [categories, setCategories, ready];
}

/* ---------------- Supabase Goals ---------------- */
function useSupabaseGoals(initial) {
  const [goals, setGoalsState] = useState([]);
  const [ready, setReady] = useState(false);

  const loadGoals = async () => {
    const { data: goalData, error: goalError } = await supabase
      .from("goals")
      .select("*")
      .order("created_at", { ascending: true });

    if (goalError) {
      console.error("Gagal memuat goals:", goalError);
      setGoalsState(initial);
      setReady(true);
      return;
    }

    const { data: logData, error: logError } = await supabase
      .from("goal_logs")
      .select("*")
      .order("date", { ascending: true });

    if (logError) {
      console.error("Gagal memuat goal logs:", logError);
      setGoalsState((goalData || []).map((g) => ({ ...g, logs: [] })));
      setReady(true);
      return;
    }

    const combined = (goalData || []).map((g) => ({
      ...g,
      logs: (logData || [])
        .filter((l) => l.goal_id === g.id)
        .map((l) => ({
          id: l.id,
          date: l.date,
          value: Number(l.value || 0),
        })),
    }));

    setGoalsState(combined);
    setReady(true);
  };

  useEffect(() => {
    let mounted = true;

    loadGoals();

    const channel = supabase
      .channel("wiyoso-goals-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "goals",
        },
        () => {
          if (mounted) loadGoals();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "goal_logs",
        },
        () => {
          if (mounted) loadGoals();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const setGoals = (updater) => {
    setGoalsState((prev) => {
      const next =
        typeof updater === "function" ? updater(prev) : updater;

      const normalized = next.map((goal) => {
        const isUuid =
          typeof goal.id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(goal.id);

        return isUuid
          ? goal
          : { ...goal, id: crypto.randomUUID() };
      });

      const sync = async () => {
        const prevIds = new Set(prev.map((g) => g.id));
        const nextIds = new Set(normalized.map((g) => g.id));

        /* delete removed goals */
        const deletedIds = prev
          .filter((g) => !nextIds.has(g.id))
          .map((g) => g.id);

        if (deletedIds.length) {
          const { error: logDeleteError } = await supabase
            .from("goal_logs")
            .delete()
            .in("goal_id", deletedIds);

          if (logDeleteError) {
            console.error("Gagal menghapus goal logs:", logDeleteError);
          }

          const { error: goalDeleteError } = await supabase
            .from("goals")
            .delete()
            .in("id", deletedIds);

          if (goalDeleteError) {
            console.error("Gagal menghapus goals:", goalDeleteError);
          }
        }

        /* save goals */
        if (normalized.length) {
          const goalRows = normalized.map((g) => ({
            id: g.id,
            title: g.title,
            type: g.type,
            amount: Number(g.amount || 0),
            saved: Number(g.saved || 0),
            done: Boolean(g.done),
          }));

          const { error: goalError } = await supabase
            .from("goals")
            .upsert(goalRows);

          if (goalError) {
            console.error("Gagal menyimpan goals:", goalError);
            return;
          }

          /* save logs */
          const logRows = [];

          normalized.forEach((g) => {
            (g.logs || []).forEach((log) => {
              logRows.push({
                id:
                  log.id &&
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(log.id)
                    ? log.id
                    : crypto.randomUUID(),
                goal_id: g.id,
                date: log.date,
                value: Number(log.value || 0),
              });
            });
          });

          if (logRows.length) {
            const { error: logError } = await supabase
              .from("goal_logs")
              .upsert(logRows);

            if (logError) {
              console.error("Gagal menyimpan goal logs:", logError);
            }
          }
        }
      };

      sync();

      return normalized;
    });
  };

  return [goals, setGoals, ready];
}

/* ---------------- Supabase Good News ---------------- */
function useSupabaseGoodNews(initial) {
  const [good, setGoodState] = useState([]);
  const [ready, setReady] = useState(false);

  const loadGood = async () => {
    const { data, error } = await supabase
      .from("good_news")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      console.error("Gagal memuat good news:", error);
      setGoodState(initial || []);
      setReady(true);
      return;
    }

    setGoodState(data || []);
    setReady(true);
  };

  useEffect(() => {
    let mounted = true;

    loadGood();

    const channel = supabase
      .channel("wiyoso-good-news-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "good_news",
        },
        () => {
          if (mounted) loadGood();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const setGood = (updater) => {
    setGoodState((prev) => {
      const next =
        typeof updater === "function" ? updater(prev) : updater;

      const normalized = next.map((item) => ({
        ...item,
        id:
          typeof item.id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id)
            ? item.id
            : crypto.randomUUID(),
      }));

      const sync = async () => {
        const prevIds = new Set(prev.map((x) => x.id));
        const nextIds = new Set(normalized.map((x) => x.id));

        const deletedIds = prev
          .filter((x) => !nextIds.has(x.id))
          .map((x) => x.id);

        if (deletedIds.length) {
          const { error } = await supabase
            .from("good_news")
            .delete()
            .in("id", deletedIds);

          if (error) {
            console.error("Gagal menghapus good news:", error);
          }
        }

        if (normalized.length) {
          const rows = normalized.map((x) => ({
            id: x.id,
            text: x.text,
            date: x.date,
          }));

          const { error } = await supabase
            .from("good_news")
            .upsert(rows);

          if (error) {
            console.error("Gagal menyimpan good news:", error);
          }
        }
      };

      sync();

      return normalized;
    });
  };

  return [good, setGood, ready];
}

/* ---------------- Supabase Members ---------------- */
function useSupabaseMembers(initial) {
  const [members, setMembersState] = useState([]);
  const [ready, setReady] = useState(false);

  const loadMembers = async () => {
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Gagal memuat members:", error);
      setMembersState(initial || []);
      setReady(true);
      return;
    }

    setMembersState(data || []);
    setReady(true);
  };

  useEffect(() => {
    let mounted = true;

    loadMembers();

    const channel = supabase
      .channel("wiyoso-members-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "members",
        },
        () => {
          if (mounted) loadMembers();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const setMembers = (updater) => {
    setMembersState((prev) => {
      const next =
        typeof updater === "function" ? updater(prev) : updater;

      const normalized = next.map((item) => ({
        ...item,
        id:
          typeof item.id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id)
            ? item.id
            : crypto.randomUUID(),
      }));

      const sync = async () => {
        const nextIds = new Set(normalized.map((x) => x.id));

        const deletedIds = prev
          .filter((x) => !nextIds.has(x.id))
          .map((x) => x.id);

        if (deletedIds.length) {
          const { error } = await supabase
            .from("members")
            .delete()
            .in("id", deletedIds);

          if (error) {
            console.error("Gagal menghapus member:", error);
          }
        }

        if (normalized.length) {
          const rows = normalized.map((x) => ({
            id: x.id,
            name: x.name,
            role: x.role,
            color: x.color,
          }));

          const { error } = await supabase
            .from("members")
            .upsert(rows);

          if (error) {
            console.error("Gagal menyimpan members:", error);
          }
        }
      };

      sync();

      return normalized;
    });
  };

  return [members, setMembers, ready];
}

/* ---------------- Supabase Reflections ---------------- */
function useSupabaseReflections(initial) {
  const [reflections, setReflectionsState] = useState(initial || {});
  const [ready, setReady] = useState(false);

  const loadReflections = async () => {
    const { data, error } = await supabase
      .from("monthly_reviews")
      .select("*")
      .order("month_key", { ascending: true });

    if (error) {
      console.error("Gagal memuat monthly review:", error);
      setReflectionsState(initial || {});
      setReady(true);
      return;
    }

    const mapped = {};

    (data || []).forEach((row) => {
      mapped[row.month_key] = {
        good: row.learned || "",
        improve: row.improved || "",
        next: row.next_focus || "",
        grateful: row.grateful || "",
      };
    });

    setReflectionsState(mapped);
    setReady(true);
  };

  useEffect(() => {
    let mounted = true;

    loadReflections();

    const channel = supabase
      .channel("wiyoso-monthly-review-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "monthly_reviews",
        },
        () => {
          if (mounted) loadReflections();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const setReflections = (updater) => {
    setReflectionsState((prev) => {
      const next =
        typeof updater === "function" ? updater(prev) : updater;

      const sync = async () => {
        for (const [monthKey, value] of Object.entries(next)) {
          const { error } = await supabase
            .from("monthly_reviews")
            .upsert(
              {
                month_key: monthKey,
                grateful: value.grateful || "",
                learned: value.good || "",
                improved: value.improve || "",
                next_focus: value.next || "",
              },
              {
                onConflict: "month_key",
              }
            );

          if (error) {
            console.error(
              "Gagal menyimpan monthly review:",
              error
            );
          }
        }
      };

      sync();

      return next;
    });
  };

  return [reflections, setReflections, ready];
}

/* ---------------- goal helpers ---------------- */
function goalPct(g) {
  if (g.type === "checklist") return g.done ? 100 : 0;
  return g.amount ? Math.min(100, Math.round((g.saved / g.amount) * 100)) : 0;
}
function pctAtDate(g, dateStr) {
  const logs = (g.logs || []).filter((l) => l.date <= dateStr);
  if (!logs.length) return null;
  return logs[logs.length - 1].value;
}

/* ---------------- small UI atoms ---------------- */
function Modal({ title, children, close, wide }) {
  return (
    <div className="backdrop" onMouseDown={close}>
      <div className={"modal" + (wide ? " wide" : "")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHead"><h2>{title}</h2><button className="icon" onClick={close}><X /></button></div>
        {children}
      </div>
    </div>
  );
}
function RingProgress({ value, size = 56, stroke = 6, color = "#7C9473", label }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E4EADD" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .5s ease" }} />
      </svg>
      <span className="ringLabel">{label ?? `${Math.round(value)}%`}</span>
    </div>
  );
}
function Delta({ from, to, suffix = "", fmt = (n) => n }) {
  const diff = to - from;
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const cls = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  return <span className={"delta " + cls}><Icon size={13} />{diff === 0 ? "Tetap" : `${diff > 0 ? "+" : ""}${fmt(diff)}${suffix}`}</span>;
}
function Empty({ text }) { return <div className="empty">{text}</div>; }
function Card({ title, Icon, action, click, children }) {
  return (
    <section className="card">
      <div className="cardHead"><h2>{Icon && <Icon size={18} />}{title}</h2>{action && <button className="link" onClick={click}>{action}</button>}</div>
      {children}
    </section>
  );
}
function Stat({ I, label, value, click, accent }) {
  return (
    <button className="stat" onClick={click} style={accent ? { borderColor: accent + "55" } : undefined}>
      <div className="statIcon" style={accent ? { background: accent + "22", color: accent } : undefined}><I size={20} /></div>
      <div><small>{label}</small><strong>{value}</strong><span>{click ? "Lihat →" : " "}</span></div>
    </button>
  );
}
function Page({ title, desc, add, addLabel, children }) {
  return (
    <>
      <div className="pageTitle"><div><h1>{title}</h1><p>{desc}</p></div>{add && <button className="primary" onClick={add}><Plus size={16} />{addLabel || "Tambah"}</button>}</div>
      {children}
    </>
  );
}

/* ---------------- forms ---------------- */
function TaskForm({ data, save, close, members }) {
  const picOptions = [...members.map((m) => m.name), "Bersama"];
  const [f, setF] = useState(data || { title: "", pic: picOptions[0] || "Bersama", deadline: today(), time: "", priority: "Sedang" });
  const [err, setErr] = useState("");
  const s = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => { if (!f.title.trim()) { setErr("Nama urusan wajib diisi."); return; } setErr(""); save(f); };
  return (
    <div className="form">
      <label>Urusan<input autoFocus value={f.title} onChange={(e) => s("title", e.target.value)} /></label>
      <div className="two">
        <label>PIC<select value={f.pic} onChange={(e) => s("pic", e.target.value)}>{picOptions.map((o) => <option key={o}>{o}</option>)}</select></label>
        <label>Prioritas<select value={f.priority} onChange={(e) => s("priority", e.target.value)}><option>Rendah</option><option>Sedang</option><option>Tinggi</option></select></label>
      </div>
      <div className="two">
        <label>Deadline<input type="date" value={f.deadline} onChange={(e) => s("deadline", e.target.value)} /></label>
        <label>Waktu<input type="time" value={f.time} onChange={(e) => s("time", e.target.value)} /></label>
      </div>
      {err && <p className="formErr">{err}</p>}
      <div className="actions"><button type="button" className="secondary" onClick={close}>Batal</button><button type="button" className="primary" onClick={submit}><Save size={16} />Simpan</button></div>
    </div>
  );
}
function EventForm({ save, close }) {
  const [f, setF] = useState({ date: today(), title: "", time: "" });
  const [err, setErr] = useState("");
  const s = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => { if (!f.title.trim()) { setErr("Nama agenda wajib diisi."); return; } if (!f.date) { setErr("Tanggal wajib diisi."); return; } setErr(""); save(f); };
  return (
    <div className="form">
      <label>Agenda<input autoFocus value={f.title} onChange={(e) => s("title", e.target.value)} /></label>
      <div className="two">
        <label>Tanggal<input type="date" value={f.date} onChange={(e) => s("date", e.target.value)} /></label>
        <label>Waktu<input type="time" value={f.time} onChange={(e) => s("time", e.target.value)} /></label>
      </div>
      {err && <p className="formErr">{err}</p>}
      <div className="actions"><button type="button" className="secondary" onClick={close}>Batal</button><button type="button" className="primary" onClick={submit}><Save size={16} />Simpan</button></div>
    </div>
  );
}
function FinanceForm({ save, close, categories }) {
  const [f, setF] = useState({ type: "expense", cat: categories[0]?.name || "", desc: "", amount: "", date: today() });
  const [err, setErr] = useState("");
  const s = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => {
    if (!f.date) { setErr("Tanggal wajib diisi."); return; }
    if (!f.amount || Number(f.amount) <= 0) { setErr("Nominal wajib diisi dan lebih dari 0."); return; }
    setErr("");
    const desc = f.desc.trim() || (f.type === "expense" ? f.cat : "Pendapatan");
    save({ ...f, desc });
  };
  return (
    <div className="form">
      <div className="two">
        <label>Jenis<select value={f.type} onChange={(e) => s("type", e.target.value)}><option value="income">Pendapatan</option><option value="expense">Pengeluaran</option></select></label>
        <label>Tanggal<input type="date" value={f.date} onChange={(e) => s("date", e.target.value)} /></label>
      </div>
      {f.type === "expense" && (
        <label>Kategori<select value={f.cat} onChange={(e) => s("cat", e.target.value)}>{categories.map((c) => <option key={c.id} value={c.name}>{c.emoji} {c.name}</option>)}</select></label>
      )}
      <label>Keterangan (opsional)<input value={f.desc} onChange={(e) => s("desc", e.target.value)} /></label>
      <label>Nominal<input type="number" min="0" value={f.amount} onChange={(e) => s("amount", e.target.value)} /></label>
      {err && <p className="formErr">{err}</p>}
      <div className="actions"><button type="button" className="secondary" onClick={close}>Batal</button><button type="button" className="primary" onClick={submit}><Save size={16} />Simpan</button></div>
    </div>
  );
}
function GoalForm({ save, close }) {
  const [f, setF] = useState({ title: "", type: "nominal", amount: "", saved: "" });
  const [err, setErr] = useState("");
  const s = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => {
    if (!f.title.trim()) { setErr("Nama goal wajib diisi."); return; }
    if (f.type === "nominal" && !f.amount) { setErr("Target nominal wajib diisi."); return; }
    setErr(""); save(f);
  };
  return (
    <div className="form">
      <label>Nama goal<input autoFocus value={f.title} onChange={(e) => s("title", e.target.value)} /></label>
      <div className="segmented">
        <button type="button" className={f.type === "nominal" ? "active" : ""} onClick={() => s("type", "nominal")}>Dengan nominal</button>
        <button type="button" className={f.type === "checklist" ? "active" : ""} onClick={() => s("type", "checklist")}>Tanpa nominal</button>
      </div>
      {f.type === "nominal" && (
        <div className="two">
          <label>Target nominal<input type="number" min="0" value={f.amount} onChange={(e) => s("amount", e.target.value)} /></label>
          <label>Sudah terkumpul<input type="number" min="0" value={f.saved} onChange={(e) => s("saved", e.target.value)} /></label>
        </div>
      )}
      {f.type === "checklist" && <p className="hint">Goal ini akan berupa checklist — tandai "Tercapai" saat sudah selesai.</p>}
      {err && <p className="formErr">{err}</p>}
      <div className="actions"><button type="button" className="secondary" onClick={close}>Batal</button><button type="button" className="primary" onClick={submit}><Save size={16} />Simpan</button></div>
    </div>
  );
}
function GoalUpdateForm({ goal, save, close }) {
  const [saved, setSaved] = useState(goal.saved ?? 0);
  return (
    <div className="form">
      <label>Update jumlah terkumpul untuk "{goal.title}"<input autoFocus type="number" min="0" value={saved} onChange={(e) => setSaved(e.target.value)} /></label>
      <div className="actions"><button type="button" className="secondary" onClick={close}>Batal</button><button type="button" className="primary" onClick={() => save(Number(saved) || 0)}><Save size={16} />Simpan</button></div>
    </div>
  );
}
function GoodForm({ save, close }) {
  const [f, setF] = useState({ text: "", date: today() });
  const [err, setErr] = useState("");
  const submit = () => { if (!f.text.trim()) { setErr("Berita baik wajib diisi."); return; } if (!f.date) { setErr("Tanggal wajib diisi."); return; } setErr(""); save(f); };
  return (
    <div className="form">
      <label>Berita baik<input autoFocus value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></label>
      <label>Tanggal<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
      {err && <p className="formErr">{err}</p>}
      <div className="actions"><button type="button" className="secondary" onClick={close}>Batal</button><button type="button" className="primary" onClick={submit}><Save size={16} />Simpan</button></div>
    </div>
  );
}
function MemberForm({ save, close }) {
  const [f, setF] = useState({ name: "", role: "Orang tua" });
  const [err, setErr] = useState("");
  const colors = ["#7C9473", "#B98B4E", "#8FA37D", "#5F7350", "#A9BE9C", "#C7A76B"];
  const submit = () => { if (!f.name.trim()) { setErr("Nama wajib diisi."); return; } setErr(""); save({ ...f, color: colors[Math.floor(Math.random() * colors.length)] }); };
  return (
    <div className="form">
      <label>Nama<input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label>Peran<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option>Orang tua</option><option>Anak</option><option>Anggota lain</option></select></label>
      {err && <p className="formErr">{err}</p>}
      <div className="actions"><button type="button" className="secondary" onClick={close}>Batal</button><button type="button" className="primary" onClick={submit}><Save size={16} />Simpan</button></div>
    </div>
  );
}
function CategoryManager({ categories, addCat, delCat, close }) {
  const [name, setName] = useState(""); const [emoji, setEmoji] = useState("📦");
  const submit = () => { if (!name.trim()) return; addCat({ id: uid(), name: name.trim(), emoji: emoji || "📦" }); setName(""); setEmoji("📦"); };
  return (
    <Modal title="Kelola kategori pengeluaran" close={close}>
      <div className="catList">
        {categories.map((c) => (
          <div className="catRow" key={c.id}><span className="catEmoji">{c.emoji}</span><span className="catName">{c.name}</span><button className="icon danger" onClick={() => delCat(c.id)}><Trash2 size={15} /></button></div>
        ))}
        {!categories.length && <Empty text="Belum ada kategori." />}
      </div>
      <div className="form catAdd">
        <div className="two catAddRow">
          <input className="emojiInput" maxLength={2} value={emoji} onChange={(e) => setEmoji(e.target.value)} />
          <input placeholder="Nama kategori baru" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="secondary" type="button" onClick={submit}><Plus size={15} />Tambah kategori</button>
      </div>
    </Modal>
  );
}
function ReflectionField({ label, icon, value, onChange }) {
  return (
    <label className="reflField">
      <span>{icon} {label}</span>
      <textarea rows={2} value={value} placeholder="Tulis di sini…" onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/* ================= APP ================= */
export default function App() {
  const [tasks, setTasksRaw, r1] = useSupabaseTasks(starterTasks);
const [events, setEvents, r2] = useSupabaseEvents([]);
const [finance, setFinance, r3] = useSupabaseFinance([]);
const [goals, setGoalsRaw, r4] = useSupabaseGoals([]);
const [good, setGood, r5] = useSupabaseGoodNews([]);
const [members, setMembers, r6] = useSupabaseMembers(starterMembers);
const [categories, setCategories, r7] = useSupabaseCategories(starterCategories);
const [reflections, setReflections, r8] = useSupabaseReflections({});
  const [tab, setTab] = useState("home");
  const [modal, setModal] = useState(null);
  const [reviewMonth, setReviewMonth] = useState(mKey(today()));

  const ready = r1 && r2 && r3 && r4 && r5 && r6 && r7 && r8;
  const setTasks = setTasksRaw;

  const toggle = (id) => setTasks((p) => p.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  const del = (id) => setTasks((p) => p.filter((x) => x.id !== id));
  const saveTask = (d) => {
    setTasks((p) => (modal?.data ? p.map((x) => (x.id === modal.data.id ? { ...d, id: x.id, done: x.done } : x)) : [...p, { ...d, id: uid(), done: false }]));
    setModal(null);
  };

  const setGoals = (fn) => {
    setGoalsRaw((prev) => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      next.forEach((g) => {
        const prevG = prev.find((x) => x.id === g.id);
        const wasAchieved = prevG ? goalPct(prevG) >= 100 : false;
        const isAchieved = goalPct(g) >= 100;
        if (isAchieved && !wasAchieved) {
          setGood((gp) => [...gp, { id: uid(), text: `🎉 Goal tercapai: ${g.title}`, date: today(), auto: true }]);
        }
      });
      return next;
    });
  };
  const addGoal = (f) => {
    const base = { id: uid(), title: f.title, type: f.type, done: false };
    if (f.type === "nominal") {
      const amount = Number(f.amount || 0), saved = Number(f.saved || 0);
      base.amount = amount; base.saved = saved;
      base.logs = [{ date: today(), value: amount ? Math.min(100, Math.round((saved / amount) * 100)) : 0 }];
    } else {
      base.amount = 0; base.saved = 0;
      base.logs = [{ date: today(), value: 0 }];
    }
    setGoals((p) => [...p, base]);
    setModal(null);
  };
  const updateGoalSaved = (goal, newSaved) => {
    setGoals((p) => p.map((g) => {
      if (g.id !== goal.id) return g;
      const val = g.amount ? Math.min(100, Math.round((newSaved / g.amount) * 100)) : 0;
      return { ...g, saved: newSaved, logs: [...(g.logs || []), { date: today(), value: val }] };
    }));
    setModal(null);
  };
  const toggleChecklistGoal = (goal) => {
    setGoals((p) => p.map((g) => {
      if (g.id !== goal.id) return g;
      const done = !g.done;
      return { ...g, done, logs: [...(g.logs || []), { date: today(), value: done ? 100 : 0 }] };
    }));
  };
  const delGoal = (id) => setGoals((p) => p.filter((x) => x.id !== id));

  const income = finance.filter((x) => x.type === "income").reduce((a, x) => a + Number(x.amount), 0);
  const expense = finance.filter((x) => x.type === "expense").reduce((a, x) => a + Number(x.amount), 0);

  const nav = [
    ["home", "Home", Leaf], ["tasks", "Urusan Rumah", CheckSquare], ["calendar", "Calendar", CalendarDays],
    ["finance", "Keuangan", WalletCards], ["goals", "Goals", Target], ["family", "Family", Users],
    ["good", "Berita Baik", Heart], ["review", "Monthly Review", BarChart3],
  ];

  const review = useMemo(() => {
    const mk = reviewMonth;
    const build = (mkX) => {
      const monthTasks = tasks.filter((t) => inMonth(t.deadline, mkX));
      const total = monthTasks.length, done = monthTasks.filter((t) => t.done).length;
      const completion = total ? Math.round((done / total) * 100) : 0;
      const byPic = {};
      monthTasks.forEach((t) => { byPic[t.pic] = byPic[t.pic] || { pic: t.pic, count: 0, done: 0 }; byPic[t.pic].count++; if (t.done) byPic[t.pic].done++; });
      const picTable = Object.values(byPic).sort((a, b) => b.count - a.count);
      const monthEvents = events.filter((e) => inMonth(e.date, mkX));
      const weeks = [1, 2, 3, 4].map((w) => monthEvents.filter((e) => weekOfMonth(e.date) === w).length + monthTasks.filter((t) => weekOfMonth(t.deadline) === w).length);
      const monthFin = finance.filter((x) => inMonth(x.date, mkX));
      const inc = monthFin.filter((x) => x.type === "income").reduce((a, x) => a + Number(x.amount), 0);
      const exp = monthFin.filter((x) => x.type === "expense").reduce((a, x) => a + Number(x.amount), 0);
      const byCat = {};
      monthFin.filter((x) => x.type === "expense").forEach((x) => { byCat[x.cat] = (byCat[x.cat] || 0) + Number(x.amount); });
      const catList = Object.entries(byCat).map(([name, amount]) => ({ name, amount, emoji: categories.find((c) => c.name === name)?.emoji || "📦" })).sort((a, b) => b.amount - a.amount);
      const topCat = catList[0] ? { ...catList[0], share: exp ? Math.round((catList[0].amount / exp) * 1000) / 10 : 0 } : null;
      const start = firstDay(mkX), end = lastDay(mkX);
      const goalsComputed = goals.map((g) => {
        const beforeStart = (g.logs || []).filter((l) => l.date < start);
        const upToEnd = (g.logs || []).filter((l) => l.date <= end);
        const startVal = beforeStart.length ? beforeStart[beforeStart.length - 1].value : null;
        const endVal = upToEnd.length ? upToEnd[upToEnd.length - 1].value : (startVal ?? 0);
        return { goal: g, startVal, endVal, delta: startVal === null ? null : endVal - startVal, isNew: startVal === null && upToEnd.length > 0 };
      }).filter((r) => r.endVal !== undefined);
      const achieved = goalsComputed.filter((r) => r.endVal >= 100 && (r.startVal === null || r.startVal < 100));
      const progressed = goalsComputed.filter((r) => r.delta !== null && r.delta > 0 && r.endVal < 100);
      const stalled = goalsComputed.filter((r) => r.delta === 0 && r.endVal < 100 && r.startVal !== null);
      const activeGoals = goals.filter((g) => goalPct(g) < 100);
      const monthGood = good.filter((g) => inMonth(g.date, mkX));
      const monthReflection = reflections[mkX] || { good: "", improve: "", next: "", grateful: "" };
      return { total, done, notDone: total - done, completion, picTable, monthEvents, weeks, inc, exp, net: inc - exp, catList, topCat, goalsComputed, achieved, progressed, stalled, activeGoals, monthGood, monthReflection };
    };
    return { current: build(mk), prev: build(shiftMonth(mk, -1)) };
  }, [tasks, events, finance, goals, good, categories, reflections, reviewMonth]);

  const setReflection = (field, value) => {
    setReflections((p) => ({ ...p, [reviewMonth]: { ...(p[reviewMonth] || { good: "", improve: "", next: "", grateful: "" }), [field]: value } }));
  };

  if (!ready) return (<div className="loadingScreen"><style>{CSS}</style><Loader2 className="spin" size={28} /><p>Memuat data keluarga…</p></div>);

  const R = review.current, P = review.prev;

  return (
    <div className="app">
      <style>{CSS}</style>
      <aside>
        <div className="brand"><b><Leaf size={19} /></b><div><strong>WIYOSO</strong><small>FAMILY HUB</small></div></div>
        <p className="tag">Plan together.<br />Grow together.<br />Be grateful.</p>
        <nav>{nav.map(([id, label, I]) => <button className={tab === id ? "active" : ""} onClick={() => setTab(id)} key={id}><I size={18} />{label}</button>)}</nav>
        <div className="note"><Clock3 size={17} /><b>Family reminder</b><p>Hal kecil yang dilakukan bersama bisa menjadi perubahan besar. ♡</p></div>
      </aside>
      <main>
        <header>
          <div><h1>{tab === "home" ? "Good day, Family" : nav.find((x) => x[0] === tab)?.[1]}</h1><p>Take care of today. Build for tomorrow. Remember the good.</p></div>
          <div className="date"><CalendarDays size={18} /><b>{new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</b></div>
        </header>

        {tab === "home" && (
          <>
            <div className="stats">
              <Stat I={CheckSquare} label="Urusan Selesai" value={`${tasks.filter((x) => x.done).length} / ${tasks.length}`} />
              <Stat I={CalendarDays} label="Agenda Hari Ini" value={events.filter((x) => x.date === today()).length} click={() => setTab("calendar")} />
              <Stat I={WalletCards} label="Saldo Saat Ini" value={money(income - expense)} click={() => setTab("finance")} />
              <Stat I={Target} label="Goals Aktif" value={goals.filter((x) => goalPct(x) < 100).length} click={() => setTab("goals")} />
              <Stat I={Heart} label="Berita Baik" value={good.length} click={() => setTab("good")} />
            </div>
            <div className="grid3">
              <Card title="Fokus Hari Ini" Icon={CheckSquare} action="+ Tambah urusan" click={() => setModal({ type: "task" })}>
                {tasks.slice(0, 4).map((t) => <TaskRow key={t.id} t={t} toggle={toggle} edit={(t) => setModal({ type: "task", data: t })} del={del} />)}
                {!tasks.length && <Empty text="Belum ada urusan." />}
              </Card>
              <Card title="Agenda Terdekat" Icon={CalendarDays} action="Lihat kalender →" click={() => setTab("calendar")}>
                {events.slice(0, 4).map((e) => <div className="event" key={e.id}><b>{dateText(e.date)}</b><div><strong>{e.title}</strong><small>{e.time}</small></div></div>)}
                {!events.length && <Empty text="Belum ada agenda." />}
              </Card>
              <Card title="Pengeluaran Bulan Ini" Icon={WalletCards} action="Lihat laporan →" click={() => setTab("finance")}>
                <div className="big">{money(expense)}</div><small>Total pengeluaran</small>
              </Card>
            </div>
            <div className="grid2">
              <Card title="Goals Progress" Icon={Target}>{goals.length ? goals.map((g) => <GoalRow g={g} key={g.id} />) : <Empty text="Belum ada goal." />}</Card>
              <Card title="Berita Baik Terbaru" Icon={Heart}>
                {good.length ? [...good].slice(-3).reverse().map((g) => <div className="good" key={g.id}>🌷 <div><p>{g.text}</p><small>{dateText(g.date)}</small></div></div>) : <Empty text="Belum ada berita baik." />}
              </Card>
            </div>
          </>
        )}

        {tab === "tasks" && <Page title="Urusan Rumah" desc="Semua tugas keluarga, PIC, prioritas, dan deadline." add={() => setModal({ type: "task" })}><div className="card">{tasks.map((t) => <TaskRow key={t.id} t={t} toggle={toggle} edit={(t) => setModal({ type: "task", data: t })} del={del} />)}{!tasks.length && <Empty text="Belum ada urusan." />}</div></Page>}

        {tab === "calendar" && (
          <Page title="Calendar" desc="Agenda keluarga." add={() => setModal({ type: "event" })}>
            <div className="card">
              {!events.length && <div className="empty">Klik "Tambah" untuk membuat agenda. Agenda yang dibuat akan tampil di Home.</div>}
              {events.map((e) => <div className="event" key={e.id}><b>{dateText(e.date)}</b><div><strong>{e.title}</strong><small>{e.time}</small></div><button className="icon danger" onClick={() => setEvents((p) => p.filter((x) => x.id !== e.id))}><Trash2 size={16} /></button></div>)}
            </div>
          </Page>
        )}

        {tab === "finance" && (
          <Page title="Keuangan" desc="Pemasukan, pengeluaran, dan saldo keluarga." add={() => setModal({ type: "finance" })}>
            <div className="stats mini"><Stat I={WalletCards} label="Pemasukan" value={money(income)} /><Stat I={WalletCards} label="Pengeluaran" value={money(expense)} /><Stat I={WalletCards} label="Saldo" value={money(income - expense)} /></div>
            <div className="pageTitle sub"><span className="linkish" onClick={() => setModal({ type: "categories" })}><Tag size={14} /> Kelola kategori</span></div>
            <div className="card table">
              {finance.map((x) => <div className="tableRow" key={x.id}><span>{dateText(x.date)}</span><span className={x.type === "income" ? "tag income" : "tag expense"}>{x.type === "income" ? "Pendapatan" : "Pengeluaran"}</span><span>{x.type === "expense" ? (categories.find((c) => c.name === x.cat)?.emoji || "") + " " + x.cat : "-"}</span><span>{x.desc}</span><b>{money(x.amount)}</b><button className="icon danger" onClick={() => setFinance((p) => p.filter((y) => y.id !== x.id))}><Trash2 size={15} /></button></div>)}
              {!finance.length && <Empty text="Belum ada catatan keuangan." />}
            </div>
          </Page>
        )}

        {tab === "goals" && (
          <Page title="Goals" desc="Target keluarga — dengan nominal maupun checklist." add={() => setModal({ type: "goal" })}>
            <div className="stack">
              {goals.map((g) => <div className="card goalCard" key={g.id}><RingProgress value={goalPct(g)} color={goalPct(g) >= 100 ? "#B98B4E" : "#7C9473"} /><div className="goalBody"><h3>{g.title} {goalPct(g) >= 100 && <span className="achievedTag">🎉 Tercapai</span>}</h3>{g.type === "nominal" ? <small>{money(g.saved)} / {money(g.amount)}</small> : <small>{g.done ? "Checklist — sudah tercapai" : "Checklist — belum tercapai"}</small>}</div><div className="goalActions">{g.type === "nominal" ? <button className="secondary" onClick={() => setModal({ type: "goalUpdate", data: g })}>Update</button> : <button className="secondary" onClick={() => toggleChecklistGoal(g)}>{g.done ? "Batalkan" : "Tandai tercapai"}</button>}<button className="icon danger" onClick={() => delGoal(g.id)}><Trash2 /></button></div></div>)}
              {!goals.length && <Empty text="Belum ada goal." />}
            </div>
          </Page>
        )}

        {tab === "family" && (
          <Page title="Family" desc="Anggota keluarga yang terlibat di Family Hub." add={() => setModal({ type: "member" })} addLabel="Tambah anggota">
            <div className="grid3">
              {members.map((m) => <div className="card memberCard" key={m.id}><div className="avatar" style={{ background: m.color }}>{m.name.slice(0, 1).toUpperCase()}</div><div><strong>{m.name}</strong><small>{m.role}</small></div><button className="icon danger" onClick={() => setMembers((p) => p.filter((x) => x.id !== m.id))}><Trash2 size={15} /></button></div>)}
              {!members.length && <Empty text="Belum ada anggota keluarga." />}
            </div>
          </Page>
        )}

        {tab === "good" && (
          <Page title="Berita Baik" desc="Catat hal-hal baik yang terjadi." add={() => setModal({ type: "good" })}>
            <div className="stack">
              {[...good].reverse().map((g) => <div className="card goodCard" key={g.id}>🌷<div><p>{g.text}</p><small>{dateText(g.date)}</small></div><button className="icon danger" onClick={() => setGood((p) => p.filter((x) => x.id !== g.id))}><Trash2 /></button></div>)}
              {!good.length && <Empty text="Belum ada berita baik." />}
            </div>
          </Page>
        )}

        {tab === "review" && (
          <div className="review">
            <div className="reviewHead"><div><h1>Monthly Review</h1><p className="reviewTagline">"Look back. Learn. Grow. Be grateful." 🤎</p></div><div className="monthNav"><button className="icon" onClick={() => setReviewMonth((m) => shiftMonth(m, -1))}><ChevronLeft /></button><b>{monthLabel(reviewMonth)}</b><button className="icon" onClick={() => setReviewMonth((m) => shiftMonth(m, 1))}><ChevronRight /></button></div></div>
            <Card title="Family Activity" Icon={CheckSquare}>
              <div className="stats mini"><Stat I={CheckSquare} label="Total kegiatan" value={R.total} /><Stat I={Check} label="Selesai" value={R.done} accent="#7C9473" /><Stat I={Clock3} label="Belum selesai" value={R.notDone} accent="#B98B4E" /><Stat I={BarChart3} label="Completion rate" value={pct(R.completion)} /></div>
              <h4 className="subhead">🤎 Kontribusi keluarga bulan ini</h4>
              {R.picTable.length ? <div className="picTable"><div className="picHeadRow"><span>PIC</span><span>Kegiatan</span><span>Selesai</span></div>{R.picTable.map((r) => <div className="picRow" key={r.pic}><span>{r.pic}</span><span>{r.count}</span><span>{r.done}</span></div>)}</div> : <Empty text="Belum ada kegiatan bulan ini." />}
            </Card>
            <Card title="Calendar Review" Icon={CalendarDays}>
              <div className="stats mini"><Stat I={CalendarDays} label="Agenda keluarga" value={R.monthEvents.length} /><Stat I={Clock3} label="Deadline" value={R.total} /><Stat I={CheckSquare} label="Event selesai" value={R.done} /></div>
              <div className="weekBars">{R.weeks.map((w, i) => { const max = Math.max(1, ...R.weeks); return <div className="weekBar" key={i}><div className="weekBarTrack"><div className="weekBarFill" style={{ height: `${(w / max) * 100}%` }} /></div><small>Week {i + 1}</small><b>{w}</b></div>; })}</div>
            </Card>
            <Card title="Monthly Finance Review" Icon={WalletCards}>
              <div className="stats mini"><Stat I={WalletCards} label="Total Pendapatan" value={money(R.inc)} accent="#7C9473" /><Stat I={WalletCards} label="Total Pengeluaran" value={money(R.exp)} accent="#B98B4E" /><Stat I={WalletCards} label="Net" value={money(R.net)} /></div>
              <h4 className="subhead">Pengeluaran berdasarkan kategori</h4>
              {R.catList.length ? <div className="catBars">{R.catList.map((c) => { const maxA = R.catList[0].amount || 1; return <div className="catBarRow" key={c.name}><span className="catBarLabel">{c.emoji} {c.name}</span><div className="catBarTrack"><div className="catBarFill" style={{ width: `${(c.amount / maxA) * 100}%` }} /></div><b>{money(c.amount)}</b></div>; })}</div> : <Empty text="Belum ada pengeluaran bulan ini." />}
              {R.topCat && <div className="highlightBox">Kategori terbesar bulan ini: <b>{R.topCat.emoji} {R.topCat.name}</b> — {R.topCat.share}%</div>}
            </Card>
            <Card title="Goals Review" Icon={Target}>
              <div className="stats mini"><Stat I={Target} label="Goal aktif" value={R.activeGoals.length} /><Stat I={Sparkles} label="Goal tercapai" value={R.achieved.length} accent="#B98B4E" /><Stat I={TrendingUp} label="Mengalami progress" value={R.progressed.length} accent="#7C9473" /><Stat I={Minus} label="Belum bergerak" value={R.stalled.length} /></div>
              {R.goalsComputed.length ? <div className="stack" style={{ marginTop: 12 }}>{R.goalsComputed.map((r) => <div className="goalReviewRow" key={r.goal.id}><span className="goalReviewTitle">{r.goal.title}</span><span className="goalReviewProgress">{r.startVal === null ? "Goal baru" : `${pct(r.startVal)} → ${pct(r.endVal)}`}</span>{r.startVal !== null && <Delta from={r.startVal} to={r.endVal} suffix="%" />}</div>)}</div> : <Empty text="Belum ada goal." />}
              {R.achieved.length > 0 && <div className="achievedList">{R.achieved.map((r) => <div className="achievedCard" key={r.goal.id}>🎉 <div><b>{r.goal.title}</b><small>{r.goal.type === "nominal" ? `Target ${money(r.goal.amount)} — Tercapai ${monthLabel(reviewMonth)}` : `Tercapai ${monthLabel(reviewMonth)}`}</small></div></div>)}</div>}
            </Card>
            <Card title="🌷 Our Good News" Icon={Heart}>
              <p className="reviewSub">{R.monthGood.length} berita baik bulan ini.</p>
              <div className="stack">{R.monthGood.map((g) => <div className="good" key={g.id}>🌷 <div><small>{dateText(g.date)}</small><p>{g.text}</p></div></div>)}{!R.monthGood.length && <Empty text="Belum ada berita baik bulan ini." />}</div>
              {R.monthReflection.grateful && <div className="gratitudeBox">🤎 Gratitude of the Month<p>"{R.monthReflection.grateful}"</p></div>}
            </Card>
            <Card title="Comparison" Icon={BarChart3}>
              <p className="reviewSub">{monthLabel(shiftMonth(reviewMonth, -1))} vs {monthLabel(reviewMonth)}</p>
              <div className="compareGrid">
                <div className="compareRow"><span>Family Activity</span><small>{P.total} → {R.total}</small><Delta from={P.total} to={R.total} /></div>
                <div className="compareRow"><span>Completion Rate</span><small>{pct(P.completion)} → {pct(R.completion)}</small><Delta from={P.completion} to={R.completion} suffix="%" /></div>
                <div className="compareRow"><span>Pendapatan</span><small>{money(P.inc)} → {money(R.inc)}</small><Delta from={P.inc} to={R.inc} fmt={money} /></div>
                <div className="compareRow"><span>Pengeluaran</span><small>{money(P.exp)} → {money(R.exp)}</small><Delta from={P.exp} to={R.exp} fmt={money} /></div>
                <div className="compareRow"><span>Berita Baik</span><small>{P.monthGood.length} → {R.monthGood.length}</small><Delta from={P.monthGood.length} to={R.monthGood.length} /></div>
                <div className="compareRow"><span>Goals tercapai</span><small>{P.achieved.length} → {R.achieved.length}</small><Delta from={P.achieved.length} to={R.achieved.length} /></div>
              </div>
            </Card>
            <Card title="🌱 Family Reflection" Icon={Sparkles}>
              <div className="reflGrid">
                <ReflectionField label="Apa yang berjalan baik bulan ini?" icon="✍️" value={R.monthReflection.good} onChange={(v) => setReflection("good", v)} />
                <ReflectionField label="Apa yang perlu diperbaiki?" icon="✍️" value={R.monthReflection.improve} onChange={(v) => setReflection("improve", v)} />
                <ReflectionField label="Apa yang ingin kita lakukan bulan depan?" icon="✍️" value={R.monthReflection.next} onChange={(v) => setReflection("next", v)} />
                <ReflectionField label="Apa yang paling kita syukuri?" icon="🤎" value={R.monthReflection.grateful} onChange={(v) => setReflection("grateful", v)} />
              </div>
            </Card>
          </div>
        )}

        {tab !== "review" && <div className="affirm">♡ Bersyukur hari ini, berusaha lebih baik esok hari, membangun masa depan bersama.</div>}
      </main>

      {modal?.type === "task" && <Modal title={modal.data ? "Edit urusan" : "Tambah urusan"} close={() => setModal(null)}><TaskForm data={modal.data} save={saveTask} close={() => setModal(null)} members={members} /></Modal>}
      {modal?.type === "event" && <Modal title="Tambah agenda" close={() => setModal(null)}><EventForm close={() => setModal(null)} save={(d) => { setEvents((p) => [...p, { ...d, id: uid() }]); setModal(null); }} /></Modal>}
      {modal?.type === "finance" && <Modal title="Catat keuangan" close={() => setModal(null)}><FinanceForm categories={categories} close={() => setModal(null)} save={(d) => { setFinance((p) => [...p, { ...d, id: uid(), amount: Number(d.amount || 0) }]); setModal(null); }} /></Modal>}
      {modal?.type === "categories" && <CategoryManager categories={categories} addCat={(c) => setCategories((p) => [...p, c])} delCat={(id) => setCategories((p) => p.filter((x) => x.id !== id))} close={() => setModal(null)} />}
      {modal?.type === "goal" && <Modal title="Tambah goal" close={() => setModal(null)}><GoalForm close={() => setModal(null)} save={addGoal} /></Modal>}
      {modal?.type === "goalUpdate" && <Modal title="Update progress goal" close={() => setModal(null)}><GoalUpdateForm goal={modal.data} close={() => setModal(null)} save={(saved) => updateGoalSaved(modal.data, saved)} /></Modal>}
      {modal?.type === "good" && <Modal title="Tambah berita baik" close={() => setModal(null)}><GoodForm close={() => setModal(null)} save={(d) => { setGood((p) => [...p, { ...d, id: uid() }]); setModal(null); }} /></Modal>}
      {modal?.type === "member" && <Modal title="Tambah anggota" close={() => setModal(null)}><MemberForm close={() => setModal(null)} save={(d) => { setMembers((p) => [...p, { ...d, id: uid() }]); setModal(null); }} /></Modal>}
    </div>
  );
}

function TaskRow({ t, toggle, edit, del }) {
  return (
    <div className={"task " + (t.done ? "done" : "")}>
      <button className={"check " + (t.done ? "checked" : "")} onClick={() => toggle(t.id)}>{t.done && <Check size={16} />}</button>
      <div className="taskText"><strong>{t.title}</strong><small>{t.pic} · {dateText(t.deadline)} {t.time && "· " + t.time}</small></div>
      <span className={"priority " + t.priority.toLowerCase()}>{t.priority}</span>
      <button className="icon" onClick={() => edit(t)}><Pencil size={16} /></button>
      <button className="icon danger" onClick={() => del(t.id)}><Trash2 size={16} /></button>
    </div>
  );
}
function GoalRow({ g }) {
  const p = goalPct(g);
  return (
    <div className="goal">
      <div><b>{g.title}</b><span>{p}%</span></div>
      <div className="bar"><i style={{ width: p + "%" }} /></div>
      {g.type === "nominal" ? <small>{money(g.saved)} / {money(g.amount)}</small> : <small>{g.done ? "Tercapai" : "Checklist"}</small>}
    </div>
  );
}

/* ---------------- CSS: Sage Green theme ---------------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box}
:root{
  --bg:#F6F4EC; --paper:#FFFFFF; --ink:#2B3328; --muted:#6E7A66;
  --sage:#6E8763; --sage-dark:#3F4B3B; --sage-light:#E3EADB;
  --gold:#B98B4E; --gold-light:#F3E6D2; --rose:#C98B7E; --rose-light:#F2E1DC;
  --border:#E1E6D9;
}
.loadingScreen{min-height:100vh;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;background:var(--bg);color:var(--muted);font-family:'Inter',system-ui,sans-serif}
.spin{animation:spin 1s linear infinite;color:var(--sage)}
@keyframes spin{to{transform:rotate(360deg)}}
.app{min-height:100vh;display:flex;font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--ink)}
button,input,select,textarea{font:inherit}
button{cursor:pointer}
h1,h2,h3{font-family:'Fraunces',serif;font-weight:600;letter-spacing:.1px}
aside{width:250px;background:var(--sage-dark);color:#F3F1E8;padding:26px 18px;position:fixed;inset:0 auto 0 0;overflow-y:auto}
.brand{display:flex;gap:10px;align-items:center}
.brand>b{width:38px;height:38px;background:var(--sage-light);color:var(--sage-dark);border-radius:12px;display:grid;place-items:center}
.brand strong{font-family:'Fraunces',serif;letter-spacing:1px;font-size:15px}
.brand small{display:block;opacity:.65;letter-spacing:2px;font-size:9.5px}
.tag{opacity:.68;line-height:1.6;font-size:13px;margin:20px 3px 26px;font-family:'Fraunces',serif;font-style:italic}
nav{display:grid;gap:4px}
nav button{border:0;background:transparent;color:#E7E7DA;border-radius:11px;padding:11px 12px;display:flex;gap:10px;align-items:center;text-align:left;transition:background .15s}
nav button.active,nav button:hover{background:#F3F1E8;color:var(--sage-dark)}
.note{border:1px solid #ffffff22;border-radius:14px;padding:14px;margin-top:28px;font-size:12px}
.note p{opacity:.65;line-height:1.5;font-family:'Fraunces',serif;font-style:italic}
main{margin-left:250px;width:calc(100% - 250px);padding:32px}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:26px}
header h1,.pageTitle h1{margin:0;font-size:26px;color:var(--sage-dark)}
header p,.pageTitle p{margin:6px 0;color:var(--muted);font-size:13.5px}
.date{background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:10px 14px;display:flex;gap:8px;align-items:center;color:var(--sage-dark)}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:18px}
.stats.mini{grid-template-columns:repeat(3,1fr)}
.stat{border:1px solid var(--border);background:var(--paper);border-radius:16px;padding:15px;display:flex;gap:11px;align-items:center;text-align:left;color:inherit}
.statIcon{width:42px;height:42px;border-radius:50%;background:var(--sage-light);color:var(--sage-dark);display:grid;place-items:center;flex:none}
.stat small,.stat span{display:block;color:var(--muted);font-size:11px}
.stat strong{display:block;font-size:18px;margin:3px 0;font-family:'Fraunces',serif}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:16px}
.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.card{background:var(--paper);border:1px solid var(--border);border-radius:18px;padding:20px}
.cardHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:11px}
.cardHead h2{font-size:16.5px;margin:0;display:flex;align-items:center;gap:8px;color:var(--sage-dark)}
.link,.linkish{border:0;background:none;color:var(--sage);font-size:12.5px;display:inline-flex;gap:5px;align-items:center;cursor:pointer;font-weight:600}
.pageTitle.sub{margin:2px 0 10px}
.task{display:grid;grid-template-columns:29px minmax(0,1fr) auto auto auto;gap:8px;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)}
.task:last-child{border-bottom:0}
.taskText strong{display:block}
.taskText small,.event small,.good small{display:block;color:var(--muted);margin-top:3px;font-size:11px}
.task.done .taskText strong{text-decoration:line-through;color:#9AA394}
.check{width:25px;height:25px;border-radius:50%;border:1.5px solid #C3CBB9;background:#fff;display:grid;place-items:center;padding:0}
.check.checked{background:var(--sage);color:#fff;border-color:var(--sage)}
.priority{font-size:10px;padding:5px 9px;border-radius:99px;background:var(--sage-light);color:var(--sage-dark);font-weight:600}
.priority.tinggi{background:var(--rose-light);color:#8C4A3B}
.priority.rendah{background:#EEF2E7;color:var(--muted)}
.priority.sedang{background:var(--gold-light);color:#8A6425}
.icon{border:0;background:transparent;width:31px;height:31px;border-radius:9px;display:grid;place-items:center;color:var(--muted)}
.icon:hover{background:var(--sage-light);color:var(--sage-dark)}
.danger:hover{color:#B0503F;background:var(--rose-light)}
.event{display:flex;gap:12px;padding:11px 0;border-bottom:1px solid var(--border);align-items:center}
.event>b{min-width:82px;color:var(--sage-dark)}
.event .icon{margin-left:auto}
.big{font-size:27px;font-weight:700;margin-top:22px;font-family:'Fraunces',serif;color:var(--sage-dark)}
.goal{padding:10px 0}
.goal>div:first-child{display:flex;justify-content:space-between;font-size:13px}
.bar{height:7px;background:var(--sage-light);border-radius:99px;margin:7px 0;overflow:hidden}
.bar i{display:block;height:100%;background:var(--sage);border-radius:99px}
.good{display:flex;gap:10px;padding:9px 0}
.good p{margin:0}
.affirm{text-align:center;color:var(--muted);padding:26px;font-size:13px;font-family:'Fraunces',serif;font-style:italic}
.pageTitle{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
.primary,.secondary{border:0;border-radius:10px;padding:10px 14px;display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:13px}
.primary{background:var(--sage-dark);color:#fff}
.primary:hover{background:var(--sage)}
.secondary{background:var(--sage-light);color:var(--sage-dark)}
.secondary:hover{background:#D7E2CB}
.table{padding:0}
.tableRow{display:grid;grid-template-columns:100px 100px 130px 1fr 130px 35px;gap:8px;padding:12px 16px;border-bottom:1px solid var(--border);font-size:12.5px;align-items:center}
.tableRow .tag{padding:3px 8px;border-radius:99px;font-size:10.5px;font-weight:600;display:inline-block}
.tag.income{background:var(--sage-light);color:var(--sage-dark)}
.tag.expense{background:var(--rose-light);color:#8C4A3B}
.stack{display:grid;gap:13px}
.goalCard{display:flex;align-items:center;gap:16px}
.goalBody{flex:1}
.goalBody h3{margin:0 0 4px;font-size:15px;display:flex;align-items:center;gap:8px}
.achievedTag{font-size:11px;background:var(--gold-light);color:#8A6425;padding:3px 8px;border-radius:99px;font-family:'Inter',sans-serif;font-weight:600}
.goalActions{display:flex;align-items:center;gap:8px}
.memberCard{display:flex;align-items:center;gap:12px}
.avatar{width:42px;height:42px;border-radius:50%;color:#fff;display:grid;place-items:center;font-weight:700;font-family:'Fraunces',serif;flex:none}
.memberCard small{display:block;color:var(--muted);font-size:11.5px;margin-top:2px}
.memberCard .icon{margin-left:auto}
.goodCard{display:flex;justify-content:flex-start;align-items:center;gap:12px}
.goodCard .icon{margin-left:auto}
.empty{text-align:center;color:#9AA394;padding:28px;font-size:13px}
.backdrop{position:fixed;inset:0;background:#2B332877;display:grid;place-items:center;padding:20px;z-index:20}
.modal{width:min(500px,100%);background:var(--paper);border-radius:18px;padding:22px;max-height:88vh;overflow-y:auto}
.modal.wide{width:min(560px,100%)}
.modalHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:15px}
.modalHead h2{margin:0;font-size:19px;color:var(--sage-dark)}
.form{display:grid;gap:12px}
.form label{display:grid;gap:6px;font-size:13px;color:var(--muted)}
.form input,.form select,.form textarea{padding:10px;border:1px solid var(--border);border-radius:10px;color:var(--ink);background:#fff}
.two{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
.segmented{display:flex;border:1px solid var(--border);border-radius:10px;overflow:hidden}
.segmented button{flex:1;border:0;background:#fff;padding:9px;font-size:12.5px;color:var(--muted)}
.segmented button.active{background:var(--sage-dark);color:#fff}
.hint{font-size:12px;color:var(--muted);margin:0}
.formErr{font-size:12.5px;color:#b3413a;background:#fbeceb;border:1px solid #f0c9c6;border-radius:8px;padding:6px 10px;margin:0}
.catList{display:grid;gap:6px;margin-bottom:14px;max-height:220px;overflow-y:auto}
.catRow{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border)}
.catEmoji{font-size:16px}
.catName{flex:1;font-size:13.5px}
.catAdd{border-top:1px solid var(--border);padding-top:14px}
.catAddRow{grid-template-columns:60px 1fr}
.emojiInput{text-align:center}
.review{display:grid;gap:16px}
.reviewHead{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:4px}
.reviewHead h1{margin:0;font-size:24px;color:var(--sage-dark)}
.reviewTagline{color:var(--muted);font-family:'Fraunces',serif;font-style:italic;margin:4px 0 0}
.monthNav{display:flex;align-items:center;gap:10px;background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:6px 10px}
.monthNav b{min-width:130px;text-align:center;font-family:'Fraunces',serif;color:var(--sage-dark)}
.subhead{font-size:13.5px;color:var(--sage-dark);margin:16px 0 8px;font-family:'Fraunces',serif}
.picTable{display:grid;gap:2px}
.picHeadRow,.picRow{display:grid;grid-template-columns:1fr 90px 90px;padding:9px 6px;font-size:13px}
.picHeadRow{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px}
.picRow{border-top:1px solid var(--border)}
.weekBars{display:flex;gap:14px;align-items:flex-end;height:120px;margin-top:14px;padding:0 4px}
.weekBar{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end}
.weekBarTrack{width:100%;height:80px;background:var(--sage-light);border-radius:8px;display:flex;align-items:flex-end;overflow:hidden}
.weekBarFill{width:100%;background:var(--sage);border-radius:8px;min-height:4px}
.weekBar small{color:var(--muted);font-size:10.5px}
.weekBar b{font-size:13px;color:var(--sage-dark)}
.catBars{display:grid;gap:9px}
.catBarRow{display:grid;grid-template-columns:150px 1fr 110px;gap:10px;align-items:center;font-size:12.5px}
.catBarLabel{color:var(--ink)}
.catBarTrack{height:10px;background:var(--sage-light);border-radius:99px;overflow:hidden}
.catBarFill{height:100%;background:var(--gold);border-radius:99px}
.highlightBox{margin-top:14px;background:var(--gold-light);color:#8A6425;padding:12px 14px;border-radius:12px;font-size:13px}
.goalReviewRow{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px}
.goalReviewTitle{flex:1;font-weight:600}
.goalReviewProgress{color:var(--muted)}
.achievedList{display:grid;gap:8px;margin-top:14px}
.achievedCard{display:flex;gap:10px;align-items:center;background:var(--gold-light);border-radius:12px;padding:11px 14px;font-size:13px}
.reviewSub{color:var(--muted);font-size:13px;margin:0 0 10px}
.gratitudeBox{margin-top:14px;background:var(--sage-light);border-radius:12px;padding:14px 16px;color:var(--sage-dark);font-family:'Fraunces',serif;font-style:italic}
.gratitudeBox p{margin:6px 0 0}
.compareGrid{display:grid;gap:10px}
.compareRow{display:grid;grid-template-columns:150px 1fr auto;align-items:center;gap:10px;font-size:13px;padding:8px 0;border-bottom:1px solid var(--border)}
.compareRow small{color:var(--muted)}
.delta{display:inline-flex;align-items:center;gap:4px;font-weight:700;font-size:12px;padding:4px 9px;border-radius:99px}
.delta.up{background:var(--sage-light);color:var(--sage-dark)}
.delta.down{background:var(--rose-light);color:#8C4A3B}
.delta.flat{background:#EEF2E7;color:var(--muted)}
.reflGrid{display:grid;gap:14px}
.reflField{display:grid;gap:6px}
.reflField span{font-size:13px;color:var(--sage-dark);font-weight:600}
.reflField textarea{border:1px solid var(--border);border-radius:10px;padding:10px;resize:vertical}
.ring{position:relative;display:grid;place-items:center;flex:none}
.ringLabel{position:absolute;font-size:12px;font-weight:700;color:var(--sage-dark)}
@media(max-width:1000px){aside{width:210px}main{margin-left:210px;width:calc(100% - 210px);padding:22px}.stats{grid-template-columns:repeat(2,1fr)}.grid3{grid-template-columns:1fr}}
@media(max-width:650px){aside{position:static;width:100%}.app{display:block}main{margin:0;width:100%;padding:16px}header{display:block}.date{margin-top:10px}.stats,.stats.mini,.grid2{grid-template-columns:1fr}.two{grid-template-columns:1fr}.task{grid-template-columns:28px 1fr auto}.tableRow{grid-template-columns:1fr 1fr}.tableRow span:nth-child(n+3){display:none}.reviewHead{flex-direction:column;align-items:flex-start;gap:10px}.compareRow{grid-template-columns:1fr}}
`;
