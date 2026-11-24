function Svg({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      aria-label={title}
      role="img"
    >
      <title>{title}</title>
      {children}
    </svg>
  );
}

export function OsIcon({ os }: { os: string | null | undefined }) {
  const value = (os ?? "").toLowerCase();
  if (value.includes("win")) {
    return (
      <Svg title="Windows">
        <path fill="#00A4EF" d="M2 3.2 11 2v9.2H2z" />
        <path fill="#7FBA00" d="M12.2 2.1 22 1v10.2H12.2z" />
        <path fill="#F25022" d="M2 12.8h9V22L2 20.7z" />
        <path fill="#FFB900" d="M12.2 12.8H22V23l-9.8-1.2z" />
      </Svg>
    );
  }
  if (value.includes("ubuntu")) {
    return (
      <Svg title="Ubuntu">
        <circle cx="12" cy="12" r="10" fill="#E95420" />
        <circle cx="12" cy="12" r="3.2" fill="#fff" />
        <circle cx="12" cy="4.6" r="1.6" fill="#fff" />
        <circle cx="5.8" cy="15.6" r="1.6" fill="#fff" />
        <circle cx="18.2" cy="15.6" r="1.6" fill="#fff" />
      </Svg>
    );
  }
  if (value.includes("linux") || value.includes("debian") || value.includes("centos")) {
    return (
      <Svg title="Linux">
        <circle cx="12" cy="12" r="10" fill="#FCC624" />
        <path
          fill="#333"
          d="M12 6.2c1.6 0 2.6 1.4 2.4 3-.2 1.6-1 2.6-1 4.2 0 .8.4 1.3.4 2.2 0 1.4-1.2 1.8-1.8 1.8s-1.8-.4-1.8-1.8c0-.9.4-1.4.4-2.2 0-1.6-.8-2.6-1-4.2-.2-1.6.8-3 2.4-3Z"
        />
      </Svg>
    );
  }
  return (
    <Svg title="Sistema">
      <rect x="3" y="5" width="18" height="12" rx="2" fill="#94A3B8" />
      <rect x="8" y="18" width="8" height="1.5" fill="#94A3B8" />
    </Svg>
  );
}

type AntivirusBrand = {
  label: string;
  bg: string;
  fg: string;
  letter: string;
};

const antivirusBrands: { test: RegExp; brand: AntivirusBrand }[] = [
  { test: /defender|microsoft|windows security/i, brand: { label: "Defender", bg: "#0078D4", fg: "#fff", letter: "D" } },
  { test: /kaspersky/i, brand: { label: "Kaspersky", bg: "#006D5C", fg: "#fff", letter: "K" } },
  { test: /eset|nod32/i, brand: { label: "ESET", bg: "#1A9F29", fg: "#fff", letter: "E" } },
  { test: /bitdefender/i, brand: { label: "Bitdefender", bg: "#E31C23", fg: "#fff", letter: "B" } },
  { test: /avast/i, brand: { label: "Avast", bg: "#FF7800", fg: "#fff", letter: "A" } },
  { test: /avg/i, brand: { label: "AVG", bg: "#FF6600", fg: "#fff", letter: "A" } },
  { test: /norton|symantec/i, brand: { label: "Norton", bg: "#FFC72C", fg: "#1A1A1A", letter: "N" } },
  { test: /mcafee/i, brand: { label: "McAfee", bg: "#C01818", fg: "#fff", letter: "M" } },
  { test: /sophos/i, brand: { label: "Sophos", bg: "#0A2E5C", fg: "#fff", letter: "S" } },
  { test: /crowdstrike|falcon/i, brand: { label: "CrowdStrike", bg: "#E31C23", fg: "#fff", letter: "C" } },
  { test: /malwarebytes/i, brand: { label: "Malwarebytes", bg: "#0A78C2", fg: "#fff", letter: "M" } },
  { test: /trend/i, brand: { label: "Trend Micro", bg: "#D71920", fg: "#fff", letter: "T" } },
  { test: /panda/i, brand: { label: "Panda", bg: "#000", fg: "#fff", letter: "P" } },
  { test: /webroot/i, brand: { label: "Webroot", bg: "#00A3E0", fg: "#fff", letter: "W" } },
];

export function antivirusBrand(name: string | null | undefined) {
  const value = name?.trim() ?? "";
  if (!value) return null;
  return (
    antivirusBrands.find((item) => item.test.test(value))?.brand ?? {
      label: value,
      bg: "#64748B",
      fg: "#fff",
      letter: value.slice(0, 1).toUpperCase(),
    }
  );
}

export function AntivirusIcon({ name }: { name: string | null | undefined }) {
  const brand = antivirusBrand(name);
  if (!brand) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center" title={name ?? brand.label}>
      <span
        className="inline-flex size-6 items-center justify-center rounded-md text-[11px] font-bold"
        style={{ background: brand.bg, color: brand.fg }}
      >
        {brand.letter}
      </span>
    </span>
  );
}
