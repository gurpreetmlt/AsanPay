/** Renders policy text split on blank lines; paragraphs matching `heading` become section titles. */
export default function PolicyText({ paragraphs, heading }: { paragraphs: string[]; heading: RegExp }) {
  return (
    <div className="glass-card rounded-2xl p-6 md:p-8 border border-neutral-200/50 dark:border-white/10 shadow-lg space-y-3">
      {paragraphs.map((para, i) =>
        heading.test(para) ? (
          <h2
            key={i}
            className="font-sora font-bold text-base md:text-lg text-brand-blue-dark dark:text-neutral-100 pt-4 first:pt-0"
          >
            {para}
          </h2>
        ) : (
          <p
            key={i}
            className="font-poppins text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed whitespace-pre-line"
          >
            {para}
          </p>
        ),
      )}
    </div>
  );
}
