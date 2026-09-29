import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, SectionList, Text, View } from 'react-native';
import { Button, Icon } from '../../src/components/ui';
import { followUpLine } from '../../src/logic/followUp';
import { addDays, AgendaItem, buildAgenda, dayKey, parseDayKey } from '../../src/logic/agenda';
import { formatAgendaDay, formatClock, LOCALE, REPEAT_LABELS } from '../../src/logic/time';
import { useAlarms } from '../../src/state/useAlarms';
import { useNow } from '../../src/state/useNow';
import { makeStyles, MIN_TOUCH, radii, spacing, typography, useTheme } from '../../src/theme';
import { LocalAlarm } from '../../src/types';

/** Så många dagar som visas i dagsremsan överst. */
const STRIP_DAYS = 42;

const weekdayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const monthFormat = new Intl.DateTimeFormat(LOCALE, { month: 'short' });

/** Öppnar ett larm i Påminnelser. [at] gör att samma larm lyfts fram igen vid nästa tryck. */
function focusParams(alarmId: string) {
  return { focus: alarmId, at: String(Date.now()) };
}

type Row = { kind: 'time'; item: AgendaItem } | { kind: 'place'; alarm: LocalAlarm };

interface Section {
  key: string;
  title: string;
  date: Date | null;
  count: number;
  data: Row[];
}

export default function AgendaScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const alarms = useAlarms();
  const now = useNow();
  const listRef = useRef<SectionList<Row, Section>>(null);
  const [showPlaces, setShowPlaces] = useState(false);

  const todayKey = dayKey(now);
  const agenda = useMemo(() => buildAgenda(alarms, now), [alarms, now]);
  // Prickarna följer listan, så att en dag med prick alltid finns där
  const busy = useMemo(() => new Set(agenda.days.map((d) => d.key)), [agenda]);
  // Byggs om bara när dagen byts, inte varje halvminut
  const strip = useMemo(() => {
    const start = parseDayKey(todayKey)!;
    return Array.from({ length: STRIP_DAYS }, (_, i) => addDays(start, i));
  }, [todayKey]);

  const sections = useMemo<Section[]>(() => {
    const result: Section[] = [];
    if (agenda.places.length > 0) {
      result.push({
        key: 'places',
        title: 'Väntar på plats',
        date: null,
        count: agenda.places.length,
        data: showPlaces ? agenda.places.map((alarm) => ({ kind: 'place', alarm })) : [],
      });
    }
    for (const day of agenda.days) {
      result.push({
        key: day.key,
        title: formatAgendaDay(day.date, now),
        date: day.date,
        count: day.items.length,
        data: day.items.map((item) => ({ kind: 'time', item })),
      });
    }
    return result;
  }, [agenda, now, showPlaces]);

  const addOn = (date: Date) => router.push({ pathname: '/new', params: { date: dayKey(date) } });
  const openAlarm = (alarm: LocalAlarm) => router.navigate({ pathname: '/', params: focusParams(alarm.id) });

  const selectedKey = useRef<string | null>(null);
  const retries = useRef(0);
  const selectDay = (date: Date) => {
    selectedKey.current = dayKey(date);
    retries.current = 0;
    const index = sections.findIndex((s) => s.key === selectedKey.current);
    if (index < 0) {
      addOn(date);
      return;
    }
    scrollToSection(index);
  };

  const scrollToSection = (sectionIndex: number) =>
    listRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, viewOffset: 60, animated: true });

  // Sektioner långt ner är inte mätta än: scrolla ungefär dit och försök igen (högst tre gånger)
  const handleScrollFailed = (info: { index: number; averageItemLength: number }) => {
    listRef.current?.getScrollResponder()?.scrollTo({ y: info.index * info.averageItemLength, animated: false });
    const target = sections.findIndex((s) => s.key === selectedKey.current);
    if (target < 0 || retries.current >= 3) return;
    retries.current += 1;
    setTimeout(() => scrollToSection(target), 100);
  };

  const renderStripDay = ({ item: date, index }: { item: Date; index: number }) => {
    const key = dayKey(date);
    const isToday = key === todayKey;
    const hasAlarms = busy.has(key);
    const showMonth = index === 0 || date.getDate() === 1;
    const label = formatAgendaDay(date, now);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}${hasAlarms ? ', har påminnelser' : ', inget planerat'}`}
        accessibilityHint={hasAlarms ? 'Visar dagen i listan' : 'Skapar en påminnelse den dagen'}
        onPress={() => selectDay(date)}
        style={({ pressed }) => [styles.stripDay, isToday && styles.stripToday, pressed && { opacity: 0.7 }]}
      >
        <Text style={[styles.stripMonth, isToday && styles.stripTodayText]}>
          {showMonth ? monthFormat.format(date).replace('.', '') : ' '}
        </Text>
        <Text style={[styles.stripWeekday, isToday && styles.stripTodayText]}>
          {weekdayFormat.format(date).replace('.', '')}
        </Text>
        <Text style={[styles.stripDate, isToday && styles.stripTodayText]}>{date.getDate()}</Text>
        <View style={[styles.dot, hasAlarms && { backgroundColor: isToday ? colors.onAccent : colors.accentText }]} />
      </Pressable>
    );
  };

  const renderRow = ({ item: row }: { item: Row }) => {
    if (row.kind === 'place') {
      const { alarm } = row;
      const enter = alarm.triggerType === 'ENTER_LOCATION';
      const where = `${enter ? 'Kommer till' : 'Lämnar'} ${alarm.location?.name ?? 'platsen'}`;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${alarm.content}, ${where}`}
          onPress={() => openAlarm(alarm)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.rowLead}>
            <Icon name={enter ? 'enter-outline' : 'exit-outline'} size={20} color={colors.accentText} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={2}>
              {alarm.content}
            </Text>
            <Text style={styles.rowMeta} numberOfLines={1}>
              {where}
            </Text>
          </View>
        </Pressable>
      );
    }

    const { alarm, at } = row.item;
    const repeating = alarm.repeat && alarm.repeat !== 'NONE';
    const followUp = followUpLine(alarm);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[formatClock(at), alarm.content, repeating && REPEAT_LABELS[alarm.repeat!], followUp]
          .filter(Boolean)
          .join(', ')}
        onPress={() => openAlarm(alarm)}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.rowLead}>
          <Text style={styles.rowTime}>{formatClock(at)}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {alarm.content}
          </Text>
          {repeating && (
            <View style={styles.repeat}>
              <Icon name="repeat" size={14} color={colors.textMuted} />
              <Text style={styles.rowMeta}>{REPEAT_LABELS[alarm.repeat!]}</Text>
            </View>
          )}
          {followUp && (
            <View style={styles.repeat}>
              <Icon
                name={alarm.triggerType === 'ENTER_LOCATION' ? 'enter-outline' : 'exit-outline'}
                size={14}
                color={colors.textMuted}
              />
              <Text style={styles.rowMeta}>{followUp}</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  const renderSectionHeader = ({ section }: { section: Section }) => {
    if (section.key === 'places') {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showPlaces }}
          accessibilityLabel={`${section.title}, ${section.count} st`}
          onPress={() => setShowPlaces((v) => !v)}
          style={styles.header}
        >
          <Icon name="location-outline" size={18} color={colors.textSecondary} />
          <Text style={[styles.headerText, { flex: 1 }]}>
            {section.title} ({section.count})
          </Text>
          <Icon name={showPlaces ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Pressable>
      );
    }
    return (
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.headerText, { flex: 1 }]}>
          {section.title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ny påminnelse ${section.title.toLowerCase()}`}
          hitSlop={8}
          onPress={() => addOn(section.date!)}
          style={styles.headerAdd}
        >
          <Icon name="add" size={22} color={colors.accentText} />
        </Pressable>
      </View>
    );
  };

  const hasTimed = agenda.days.length > 0;

  return (
    <View style={styles.screen}>
      <SectionList
        ref={listRef}
        contentInsetAdjustmentBehavior="automatic"
        sections={sections}
        keyExtractor={(row) => (row.kind === 'time' ? `${row.item.alarm.id}@${row.item.at.getTime()}` : row.alarm.id)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        onScrollToIndexFailed={handleScrollFailed}
        ListHeaderComponent={
          <FlatList
            horizontal
            data={strip}
            keyExtractor={dayKey}
            renderItem={renderStripDay}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
          />
        }
        renderSectionHeader={renderSectionHeader}
        renderItem={renderRow}
        ListFooterComponent={
          hasTimed ? (
            <Text style={styles.footnote}>
              Upprepade påminnelser visas för de närmaste två veckorna.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="calendar-outline" size={36} color={colors.accentText} />
            </View>
            <Text style={styles.emptyTitle}>Inget planerat</Text>
            <Text style={styles.emptyText}>
              Tryck på en dag ovan för att skapa en påminnelse just den dagen – även långt fram i tiden.
            </Text>
            <Button title="Ny påminnelse" icon="add" onPress={() => router.push('/new')} />
          </View>
        }
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, flexGrow: 1 },
  strip: { gap: spacing.xs, paddingVertical: spacing.sm },
  stripDay: {
    width: 52,
    minHeight: 76,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: colors.surface,
  },
  stripToday: { backgroundColor: colors.accent },
  stripMonth: { ...typography.footnote, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase' },
  stripWeekday: { ...typography.footnote, color: colors.textSecondary },
  stripDate: { ...typography.headline, color: colors.textPrimary },
  stripTodayText: { color: colors.onAccent },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH,
    marginTop: spacing.sm,
  },
  headerText: { ...typography.headline, color: colors.textSecondary },
  headerAdd: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH + 12,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowLead: { width: 52, alignItems: 'flex-start' },
  rowTime: { ...typography.callout, fontWeight: '700', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, color: colors.textPrimary },
  rowMeta: { ...typography.footnote, color: colors.textMuted },
  repeat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footnote: { ...typography.footnote, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...typography.title, color: colors.textPrimary },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
}));
