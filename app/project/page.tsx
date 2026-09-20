import {
  PublicProjectPassportRoute,
  type PublicInnerRouteProps,
} from '../../components/public-inner-routes';
import { localizedPageMetadata } from '../../lib/locale-seo';

export const metadata = localizedPageMetadata('zh-TW', '/project');

export default function ProjectPage(props: PublicInnerRouteProps) {
  return PublicProjectPassportRoute({ ...props, locale: 'zh-TW' });
}
