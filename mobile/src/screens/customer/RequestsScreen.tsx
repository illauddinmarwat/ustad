import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InboxSection } from "../../components/InboxSection";
import { GuestJobsCard } from "../../components/GuestJobsCard";
import { BiText } from "../../components/ui/BiText";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { useAuth } from "../../context/AuthContext";
import type { RootStackParamList } from "../../navigation/types";
import { colors, radius, spacing } from "../../theme/tokens";

/** Customer's posted jobs and their status. Placeholder until request history is wired up. */
export default function RequestsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const signedInCustomer = !!uid && role === "customer";
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.root,
        {
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        },
      ]}
    >
      <BiText
        id="requests.title"
        variant="displayLg"
        tone="strong"
        style={styles.title}
      />
      <GuestJobsCard />
      {signedInCustomer ? (
        <>
          <Button
            labelId="post.cta"
            onPress={() => navigation.navigate("PostJob")}
            iconLeft="plus-circle"
            fullWidth
            style={styles.postGap}
          />
          <InboxSection userId={uid} role="customer" />
        </>
      ) : (
        <View style={styles.empty}>
          <View style={styles.icon}>
            <Icon name="clipboard" size={30} color={colors.primary} />
          </View>
          <BiText
            id="requests.emptyPost"
            variant="body"
            tone="muted"
            align="center"
          />
          <BiText
            id="requests.comingSoon"
            hideUrdu
            variant="caption"
            tone="muted"
            align="center"
            style={styles.soon}
          />
          <Button
            labelId="post.cta"
            onPress={() => navigation.navigate("PostJob")}
            iconLeft="plus-circle"
            style={styles.cta}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: colors.bg },
  root: { paddingHorizontal: spacing.lg, flexGrow: 1 },
  title: { marginBottom: spacing.lg },
  empty: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm },
  icon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  soon: { marginTop: spacing.xs },
  postGap: { marginBottom: spacing.md },
  cta: { marginTop: spacing.md },
});
