<!--
  @file components/tabs/batteries/TabTopBar.vue
  @brief Top-right menu for battery store bulk actions.
-->
<script setup>
import { Transition } from 'vue'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue'
import { EllipsisVerticalIcon } from '@heroicons/vue/24/outline'

const emit = defineEmits(['calculate-stats', 'add-car'])
</script>

<template>
    <div class="flex items-center justify-end">
        <Menu as="div" class="relative">
            <MenuButton
                class="p-2 rounded-lg text-zinc-500 dark:text-gray-400 hover:bg-zinc-100 dark:hover:bg-neutral-800 hover:text-zinc-900 dark:hover:text-white transition"
                aria-label="Battery store actions">
                <EllipsisVerticalIcon class="h-6 w-6" />
            </MenuButton>

            <Transition enter-active-class="transition duration-100 ease-out"
                enter-from-class="transform scale-95 opacity-0" enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75 ease-in" leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-95 opacity-0">
                <MenuItems
                    class="absolute right-0 mt-2 w-56 origin-top-right rounded-xl bg-white dark:bg-neutral-800 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 focus:outline-none z-50 py-1">
                    <MenuItem v-slot="{ active }">
                        <button type="button" :class="[
                            active ? 'bg-primary text-white' : 'text-zinc-700 dark:text-gray-300',
                            'block w-full text-left px-4 py-2 text-sm'
                        ]" @click="emit('calculate-stats')">
                            Schedule Overnight Statistics
                        </button>
                    </MenuItem>
                    <MenuItem v-slot="{ active }">
                        <button type="button" :class="[
                            active ? 'bg-primary text-white' : 'text-zinc-700 dark:text-gray-300',
                            'block w-full text-left px-4 py-2 text-sm'
                        ]" @click="emit('add-car')">
                            Add Car to Battery Store
                        </button>
                    </MenuItem>
                </MenuItems>
            </Transition>
        </Menu>
    </div>
</template>
