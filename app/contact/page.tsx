import { PublicContactRoute } from '../../components/public-inner-routes';
import { localizedPageMetadata } from '../../lib/locale-seo';

export const metadata = localizedPageMetadata('zh-TW', '/contact');

export default function ContactPage() {
  return PublicContactRoute({ locale: 'zh-TW' });
}
