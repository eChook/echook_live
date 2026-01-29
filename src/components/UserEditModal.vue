<template>
    <TransitionRoot appear :show="isOpen" as="template">
        <Dialog as="div" @close="closeModal" class="relative z-50">
            <TransitionChild as="template" enter="duration-300 ease-out" enter-from="opacity-0" enter-to="opacity-100"
                leave="duration-200 ease-in" leave-from="opacity-100" leave-to="opacity-0">
                <div class="fixed inset-0 bg-black/75 backdrop-blur-sm" />
            </TransitionChild>

            <div class="fixed inset-0 overflow-y-auto">
                <div class="flex min-h-full items-center justify-center p-4 text-center">
                    <TransitionChild as="template" enter="duration-300 ease-out" enter-from="opacity-0 scale-95"
                        enter-to="opacity-100 scale-100" leave="duration-200 ease-in" leave-from="opacity-100 scale-100"
                        leave-to="opacity-0 scale-95">
                        <DialogPanel
                            class="w-full max-w-md transform overflow-hidden rounded-2xl bg-neutral-800 border border-neutral-700 p-6 text-left align-middle shadow-xl transition-all">
                            <DialogTitle as="h3" class="text-lg font-medium leading-6 text-white mb-4">
                                Edit User
                            </DialogTitle>

                            <div class="mt-2 space-y-4">
                                <!-- Car Name -->
                                <div>
                                    <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Car Name</label>
                                    <input v-model="form.car" type="text"
                                        class="w-full bg-neutral-900 text-white px-3 py-2 rounded border border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                                </div>

                                <!-- Team -->
                                <div>
                                    <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Team</label>
                                    <input v-model="form.team" type="text"
                                        class="w-full bg-neutral-900 text-white px-3 py-2 rounded border border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                                </div>

                                <!-- Number -->
                                <div>
                                    <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Number</label>
                                    <input v-model.number="form.number" type="number"
                                        class="w-full bg-neutral-900 text-white px-3 py-2 rounded border border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                                </div>

                                <!-- Email -->
                                <div>
                                    <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Email</label>
                                    <input v-model="form.email" type="email"
                                        class="w-full bg-neutral-900 text-white px-3 py-2 rounded border border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                                </div>

                                <!-- Is Admin -->
                                <SwitchGroup>
                                    <div class="flex items-center space-x-3">
                                        <Switch v-model="form.isAdmin"
                                            :class="form.isAdmin ? 'bg-primary' : 'bg-neutral-700'"
                                            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-neutral-900">
                                            <span :class="form.isAdmin ? 'translate-x-6' : 'translate-x-1'"
                                                class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform" />
                                        </Switch>
                                        <SwitchLabel class="text-sm font-medium text-gray-300 cursor-pointer">Is Admin
                                        </SwitchLabel>
                                    </div>
                                </SwitchGroup>

                            </div>

                            <div class="mt-6 flex justify-end space-x-3">
                                <button type="button"
                                    class="inline-flex justify-center rounded-md border border-neutral-600 bg-transparent px-4 py-2 text-sm font-medium text-gray-300 hover:bg-neutral-700 focus:outline-none"
                                    @click="closeModal">
                                    Cancel
                                </button>
                                <button type="button"
                                    class="inline-flex justify-center rounded-md border border-transparent bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                    @click="save">
                                    Save Changes
                                </button>
                            </div>
                        </DialogPanel>
                    </TransitionChild>
                </div>
            </div>
        </Dialog>
    </TransitionRoot>
</template>

<script setup>
import { ref, watch } from 'vue'
import {
    TransitionRoot,
    TransitionChild,
    Dialog,
    DialogPanel,
    DialogTitle,
    Switch,
    SwitchGroup,
    SwitchLabel
} from '@headlessui/vue'

const props = defineProps({
    modelValue: Boolean, // For v-model:open
    user: Object
})

const emit = defineEmits(['update:modelValue', 'save'])

const isOpen = ref(props.modelValue)
const form = ref({
    car: '',
    team: '',
    number: 0,
    email: '',
    isAdmin: false
})

watch(() => props.modelValue, (val) => {
    isOpen.value = val
})

watch(() => props.user, (u) => {
    if (u) {
        form.value = {
            car: u.car || u.carName || '',
            team: u.team || u.teamName || '',
            number: u.number || 0,
            email: u.email || '',
            isAdmin: u.isAdmin || false
        }
    }
}, { immediate: true })

function closeModal() {
    isOpen.value = false
    emit('update:modelValue', false)
}

function save() {
    emit('save', { ...props.user, ...form.value })
    closeModal()
}
</script>
