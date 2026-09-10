import {
  PublicCatalogRoute,
  type PublicInnerRouteProps,
} from '../../../components/public-inner-routes';

export default function CatalogPage(props: PublicInnerRouteProps) {
  return PublicCatalogRoute({ ...props, locale: 'en' });
}
