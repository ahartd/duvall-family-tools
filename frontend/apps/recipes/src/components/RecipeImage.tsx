import { useState } from 'react'

// Recipe photos are hot-linked from the original blogs (epicurious, budgetbytes,
// …). Some links rot over the years, so fall back to a tidy placeholder instead
// of a broken-image icon.
export function RecipeImage({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <div className="rec-img rec-img--ph" aria-hidden="true">
        🍽️
      </div>
    )
  }
  return (
    <img
      className="rec-img"
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  )
}
