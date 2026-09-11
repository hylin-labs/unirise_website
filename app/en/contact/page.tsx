import { PublicContactRoute } from '../../../components/public-inner-routes';
import { localizedPageMetadata } from '../../../lib/locale-seo';

export const metadata = localizedPageMetadata('en', '/contact');

export default function ContactPage() {
  return PublicContactRoute({ locale: 'en' });
}
