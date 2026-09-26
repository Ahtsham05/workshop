export default function SectionHeading({
  eyebrow,
  title,
  highlight,
  intro,
  dark = false,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  highlight?: string;
  intro?: string;
  dark?: boolean;
  align?: "center" | "left";
}) {
  return (
    <div className={`reveal mb-12 max-w-3xl md:mb-16 ${align === "center" ? "mx-auto text-center" : ""}`}>
      <p className={`eyebrow mb-3 ${dark ? "!text-cyan-300" : ""}`}>{eyebrow}</p>
      <h2
        className={`text-balance text-3xl font-extrabold leading-[1.15] tracking-tight sm:text-4xl md:text-[2.75rem] ${
          dark ? "text-white" : "text-slate-950"
        }`}
      >
        {title}
        {highlight ? (
          <>
            {" "}
            <span className={dark ? "text-gradient-light" : "text-gradient"}>{highlight}</span>
          </>
        ) : null}
      </h2>
      {intro ? (
        <p className={`mt-5 text-lg leading-relaxed ${dark ? "text-slate-300" : "text-slate-600"}`}>{intro}</p>
      ) : null}
    </div>
  );
}
