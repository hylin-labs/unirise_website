const stableImages = new Map([
  [
    'https://www.sbi-mechatronik.com/wp-content/uploads/2021/09/X-RAY_SBI_product.jpg',
    '/reference/original/sbi-thickness-measurement.jpg',
  ],
]);

export function stablePublicImage(src: string) {
  return stableImages.get(src) ?? src;
}
