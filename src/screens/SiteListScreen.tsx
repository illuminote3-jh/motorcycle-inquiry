/**
 * 웹사이트 관리 화면 (목록 / 검색 / 추가 / 편집 / 열기)
 */
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Header, colors } from '../components/ui';
import { Site, hostOf, isHttpUrl } from '../storage/vault';

type Props = {
  sites: Site[];
  onOpen: (site: Site) => void;
  onEdit: (site: Site | null) => void;
  onSettings: () => void;
  onLock: () => void;
};

export default function SiteListScreen({ sites, onOpen, onEdit, onSettings, onLock }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...sites].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    if (!q) return list;
    return list.filter(
      (s) => s.name.toLowerCase().includes(q) || hostOf(s.loginUrl, !!s.allowInsecure).includes(q) || s.username.toLowerCase().includes(q),
    );
  }, [sites, query]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Header title="웹사이트 관리" left={{ label: '잠금', onPress: onLock }} right={{ label: '설정', onPress: onSettings }} />
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="사이트 이름, 주소, 아이디 검색"
          placeholderTextColor="#A0A7B4"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {sites.length === 0 ? '등록된 사이트가 없습니다.\n아래 버튼으로 사이트를 추가하세요.' : '검색 결과가 없습니다.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.item, pressed && { backgroundColor: '#EEF2FD' }]}
            onPress={() => onOpen(item)}
            onLongPress={() => onEdit(item)}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {isHttpUrl(item.loginUrl) ? '⚠️' : '🔒'} {hostOf(item.loginUrl, !!item.allowInsecure)} · {item.username}
              </Text>
            </View>
            <Pressable onPress={() => onEdit(item)} hitSlop={10} style={styles.editBtn}>
              <Text style={styles.editText}>편집</Text>
            </Pressable>
          </Pressable>
        )}
      />
      <View style={styles.footer}>
        <Button title="+ 사이트 추가" onPress={() => onEdit(null)} />
        <Text style={styles.tip}>사이트를 누르면 자동 로그인됩니다 · 길게 누르면 편집</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
  search: {
    height: 44,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
    color: colors.text,
  },
  empty: { textAlign: 'center', color: colors.sub, marginTop: 60, lineHeight: 22 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E8EDFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: colors.primary },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.sub, marginTop: 3 },
  editBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  editText: { color: colors.primary, fontWeight: '600' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 28,
    backgroundColor: colors.bg,
  },
  tip: { textAlign: 'center', color: colors.sub, fontSize: 12, marginTop: 8 },
});
