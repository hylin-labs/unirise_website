import {
  PublicNewsRoute,
  type PublicInnerRouteProps,
} from '../../../components/public-inner-routes';

export default function NewsPage(props: PublicInnerRouteProps) {
  return PublicNewsRoute({ ...props, locale: 'en' });
}
