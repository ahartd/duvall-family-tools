// Shapes of the baked recipe snapshot (frontend/apps/recipes/src/data/recipes.json),
// generated from the family "Recipes to try" Google Sheet by data/build_data.py.

export type Recipe = {
  title: string
  url: string // '' when the sheet had no link (an idea / inline recipe)
  notes: string
  tags: string[]
}

export type MealRecipe = {
  title: string
  image: string
  url: string
}

// A curated themed dinner — a few recipes that go together.
export type MealNight = {
  title: string
  description: string
  recipes: MealRecipe[]
}

export type Side = {
  title: string
  image: string
  url: string
}

export type RecipeData = {
  generatedAt: string
  source: string
  mealNights: MealNight[]
  sides: Side[]
  recipes: Recipe[]
}
