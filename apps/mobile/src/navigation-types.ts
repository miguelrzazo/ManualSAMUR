/**
 * Shared navigation param lists. Extracted so screen modules (e.g.
 * `screens/CodigosScreen.tsx`) can type their `navigation`/`route` props
 * against the *same* param lists App.tsx registers, instead of a
 * structurally-similar but distinct local type that would make
 * `navigation.getParent()` and typed `navigate` calls unsound.
 */
import type { NavigatorScreenParams } from "@react-navigation/native";

export type TabsParamList = {
  Inicio: undefined;
  Codigos: { query?: string } | undefined;
  VademecumList: undefined;
  Mapa: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabsParamList> | undefined;
  Search: undefined;
  Procedure: { id: string };
  Drug: { id: string };
  Vademecum: { routeKey: string };
  Code: { routeKey: string };
  Abbreviations: { query?: string } | undefined;
  Location: { routeKey: string };
  Status4: undefined;
};
