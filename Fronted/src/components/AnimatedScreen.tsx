import { useRef, useCallback } from 'react'
import { Animated } from 'react-native'
import { useFocusEffect } from 'expo-router'

interface Props {
  children: React.ReactNode
}

export default function AnimatedScreen({ children }: Props) {
  const opacity    = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(10)).current

  useFocusEffect(
    useCallback(() => {
      opacity.setValue(0)
      translateY.setValue(10)
      Animated.parallel([
        Animated.timing(opacity, {
          toValue:         1,
          duration:        220,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue:         0,
          duration:        220,
          useNativeDriver: true,
        }),
      ]).start()
    }, [])
  )

  return (
    <Animated.View style={{ flex: 1, opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  )
}
