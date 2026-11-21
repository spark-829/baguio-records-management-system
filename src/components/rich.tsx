/** Renders a translated sentence where **words** are shown in bold, so a whole sentence can be translated at once. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))}
    </>
  );
}
