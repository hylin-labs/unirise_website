import { PublicHomeRoute } from '../page';
import { localizedPageMetadata } from '../../lib/locale-seo';

export const metadata = localizedPageMetadata('en', '/');

export default function EnglishHomePage() {
  return <PublicHomeRoute locale="en" />;
}
