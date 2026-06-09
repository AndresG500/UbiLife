import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Colors } from '@/constants/Colors'

interface Props {
  visible:      boolean
  titulo:       string
  mensaje:      string
  textoCancel?: string
  textoConfirm: string
  onCancel:     () => void
  onConfirm:    () => void
  destructivo?: boolean
}

export default function ConfirmModal({
  visible,
  titulo,
  mensaje,
  textoCancel = 'Cancelar',
  textoConfirm,
  onCancel,
  onConfirm,
  destructivo = false,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.titulo}>{titulo}</Text>
          <Text style={styles.mensaje}>{mensaje}</Text>
          <View style={styles.sepH} />
          <View style={styles.btns}>
            <TouchableOpacity style={styles.btn} onPress={onCancel} activeOpacity={0.7}>
              <Text style={styles.btnCancel}>{textoCancel}</Text>
            </TouchableOpacity>
            <View style={styles.sepV} />
            <TouchableOpacity style={styles.btn} onPress={onConfirm} activeOpacity={0.7}>
              <Text style={[styles.btnConfirm, destructivo && styles.btnDestructivo]}>
                {textoConfirm}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 36,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#102e50',
    width: '100%',
    overflow: 'hidden',
  },
  titulo: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 10,
  },
  mensaje: {
    fontSize: 14,
    color: '#1e293b',
    paddingHorizontal: 24,
    paddingBottom: 24,
    lineHeight: 21,
  },
  sepH:  { height: 1, backgroundColor: Colors.border },
  btns:  { flexDirection: 'row' },
  btn:   { flex: 1, paddingVertical: 16, alignItems: 'center' },
  sepV:  { width: 1, backgroundColor: Colors.border },
  btnCancel:     { fontSize: 14, fontWeight: '700', color: '#102e50' },
  btnConfirm:    { fontSize: 14, fontWeight: '700', color: '#102e50' },
  btnDestructivo:{ color: Colors.error },
})
