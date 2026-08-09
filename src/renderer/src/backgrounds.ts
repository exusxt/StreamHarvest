export const BACKGROUNDS = Object.values(
  import.meta.glob('./assets/backgrounds/*.{png,jpg,jpeg,webp}', { eager: true, import: 'default' })
) as string[]
